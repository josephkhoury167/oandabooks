// ─────────────────────────────────────────────────────────────
// O&A Books — Stripe Checkout Worker
// Deploy to Cloudflare Workers (free tier)
// Set environment secret: STRIPE_SECRET_KEY
// ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {

    // Allow CORS from oandabooks.com
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const { items, total, shipping } = body;

      // Validate
      if (!items || !items.length || !total) {
        return new Response(JSON.stringify({ error: 'Invalid cart data' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Build line items for Stripe
      // We send the full cart as one line item with a custom description
      // This avoids needing to pre-register products in Stripe
      const bookList = items.map(i => i.title).join(', ');
      const totalCents = Math.round(parseFloat(total) * 100);

      // Call Stripe API directly via fetch (no SDK needed in Workers)
      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'payment_method_types[]': 'card',
          'mode': 'payment',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][unit_amount]': totalCents,
          'line_items[0][price_data][product_data][name]': 'O&A Books Order',
          'line_items[0][price_data][product_data][description]': bookList,
          'line_items[0][quantity]': '1',
          'success_url': 'https://oandabooks.com/?payment=success',
          'cancel_url': 'https://oandabooks.com/?payment=cancelled',
          'shipping_address_collection[allowed_countries][]': 'US',
          'billing_address_collection': 'auto',
          'metadata[books]': bookList.substring(0, 500),
        })
      });

      const session = await stripeResponse.json();

      if (!stripeResponse.ok) {
        console.error('Stripe error:', session);
        return new Response(JSON.stringify({ error: session.error?.message || 'Stripe error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

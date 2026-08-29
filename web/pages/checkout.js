import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

export default function Checkout() {
  const router = useRouter();
  const { planId, price, name } = router.query;
  const [loading, setLoading] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    // dynamically load PayPal SDK
    const addScript = async () => {
      if (!window.paypal) {
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}&currency=KES`;
        script.async = true;
        document.body.appendChild(script);
        script.onload = () => {
          renderButtons();
        };
      } else {
        renderButtons();
      }
    };

    const renderButtons = () => {
      if (!window.paypal) return;

      window.paypal.Buttons({
        createOrder: async function () {
          // create order on server
          const resp = await fetch(`${apiUrl}/api/paypal/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: price, currency: 'KES', description: name, planId })
          }).then(r => r.json());

          return resp.id;
        },
        onApprove: async function (data, actions) {
          // capture on server
          const capture = await fetch(`${apiUrl}/api/paypal/capture-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID })
          }).then(r => r.json());

          console.log('Capture result', capture);
          alert('Payment completed (sandbox). Check server webhook for processing.');
        },
        onError: function (err) {
          console.error(err);
          alert('PayPal error');
        }
      }).render('#paypal-buttons');
    };

    if (price) addScript();
  }, [price]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Checkout</h1>
      <p>Plan: {name}</p>
      <p>Amount: {price} KES</p>
      <div id="paypal-buttons"></div>
      <p style={{ marginTop: 12 }}>
        Note: This demo uses the PayPal JS SDK with server-side order creation and capture + webhook verification on the API. Never expose the PayPal Client Secret in source.
      </p>
    </main>
  );
}

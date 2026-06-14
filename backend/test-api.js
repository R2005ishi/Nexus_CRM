const baseUrl = "http://localhost:3001/api/v1";

async function runTests() {
  console.log("=== STARTING API VERIFICATION TESTS ===\n");

  try {
    // 1. Ingest Customer
    console.log("1. Ingesting Customer...");
    const customerRes = await fetch(`${baseUrl}/ingest/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Aman",
        lastName: "Verma",
        email: "aman.verma@example.com",
        phone: "+919876543210",
        metadata: {
          loyaltyTier: "VIP",
          preferredChannel: "EMAIL"
        }
      })
    });
    const customerData = await customerRes.json();
    console.log("Customer Response Status:", customerRes.status);
    console.log("Customer Data:", JSON.stringify(customerData, null, 2));

    if (!customerData.customer || !customerData.customer.id) {
      throw new Error("Customer ingestion failed to return ID");
    }
    const customerId = customerData.customer.id;

    // 2. Ingest Order (No attribution yet)
    console.log("\n2. Ingesting Order (No campaign yet)...");
    const orderRes = await fetch(`${baseUrl}/ingest/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId,
        totalAmount: 1499.00,
        items: [
          { productId: "SKU-99", name: "Premium Leather Wallet", qty: 1, unitPrice: 1499.00 }
        ]
      })
    });
    const orderData = await orderRes.json();
    console.log("Order Response Status:", orderRes.status);
    console.log("Order Data:", JSON.stringify(orderData, null, 2));

    // 3. Launch Campaign (Async)
    console.log("\n3. Launching Campaign (triggering delivery stub)...");
    const campaignRes = await fetch(`${baseUrl}/campaigns/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientIds: [customerId],
        goal: "Test Conversion Flow",
        channel: "EMAIL",
        copy: "Hi Aman, here is your exclusive 20% discount code: PROMO20!"
      })
    });
    const campaignData = await campaignRes.json();
    console.log("Campaign Response Status:", campaignRes.status);
    console.log("Campaign Data:", JSON.stringify(campaignData, null, 2));

    const campaignId = campaignData.campaignId;

    // Wait for the channel stub to progress logs to CLICKED status (usually takes ~5-15s due to simulated delays)
    console.log("\nWaiting 12 seconds for simulated campaign engagement (SENT -> DELIVERED -> OPENED -> READ -> CLICKED)...");
    await new Promise(resolve => setTimeout(resolve, 12000));

    // 4. Check Campaign Stats to verify it progressed to CLICKED
    console.log("\n4. Checking Campaign Stats...");
    const statsRes = await fetch(`${baseUrl}/campaigns/${campaignId}`);
    const statsData = await statsRes.json();
    console.log("Stats Response Status:", statsRes.status);
    console.log("Stats Data:", JSON.stringify(statsData, null, 2));

    // 5. Ingest another Order (Should attribute to CLICKED -> CONVERTED)
    console.log("\n5. Ingesting Second Order (should trigger last-touch attribution)...");
    const orderAttributedRes = await fetch(`${baseUrl}/ingest/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId,
        totalAmount: 2999.00,
        items: [
          { productId: "SKU-100", name: "Designer Sunglasses", qty: 1, unitPrice: 2999.00 }
        ]
      })
    });
    const orderAttributedData = await orderAttributedRes.json();
    console.log("Attributed Order Response Status:", orderAttributedRes.status);
    console.log("Attributed Order Data:", JSON.stringify(orderAttributedData, null, 2));

    // 6. Check Stats again to confirm state is now CONVERTED
    console.log("\n6. Final Campaign Stats Check (expecting CONVERTED)...");
    const finalStatsRes = await fetch(`${baseUrl}/campaigns/${campaignId}`);
    const finalStatsData = await finalStatsRes.json();
    console.log("Final Stats Data:", JSON.stringify(finalStatsData, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTests();

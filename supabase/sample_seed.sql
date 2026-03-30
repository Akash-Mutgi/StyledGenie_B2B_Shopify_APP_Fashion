insert into merchants (id, shopify_store_domain, brand_name)
values (
    '11111111-1111-1111-1111-111111111111',
    'styledgenie-demo.myshopify.com',
    'StyledGenie Demo'
)
on conflict (shopify_store_domain) do update
set brand_name = excluded.brand_name;

insert into faqs (merchant_id, question, answer, category)
values
    (
        '11111111-1111-1111-1111-111111111111',
        'What is your shipping policy?',
        'StyledGenie ships within Germany with standard and express options, within the EU outside Germany with standard shipping, and internationally outside the EU with standard shipping for orders of EUR 70 or more. Delivery windows are estimates in business days after dispatch.',
        'shipping'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'What are the Germany shipping rates and delivery times?',
        'Germany standard shipping costs EUR 6.99 for orders up to EUR 59.99 and is free from EUR 60, with an estimated delivery of 0 to 14 business days. Germany express shipping costs EUR 14.99 up to EUR 79.99 and is free from EUR 80, with an estimated delivery of 0 to 7 business days.',
        'shipping'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'What are the EU shipping rates and delivery times outside Germany?',
        'European Union orders outside Germany ship by standard shipping. Orders up to EUR 70 cost EUR 12.99, orders above EUR 70 ship free, and the estimated delivery time is 0 to 14 business days.',
        'shipping'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'Do you ship internationally outside the EU?',
        'Yes. International orders outside the EU require a minimum order value of EUR 70. Shipping costs EUR 12.99 and estimated delivery is 0 to 21 business days. Local import duties, taxes, and fees may apply and are payable by the recipient.',
        'shipping'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'How long does order processing take and when will I get tracking?',
        'Order processing usually takes 1 to 2 business days before dispatch. A shipping confirmation with tracking is sent once the order leaves the facility.',
        'shipping'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'How are free shipping thresholds calculated?',
        'Free-shipping thresholds of EUR 60, EUR 70, and EUR 80 are calculated after discounts and before shipping fees and taxes.',
        'shipping'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'What is your return and withdrawal window?',
        'EU consumers can withdraw within 30 days of receiving the order. To start a return, email info@styledgenie.com with your order number and the items you want to return. Returns must be shipped back within 14 days after notifying StyledGenie.',
        'returns'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'What items can be returned and which items are non-returnable?',
        'Returned items must be unworn, unwashed, and in original condition with tags attached. Lingerie, swimwear, earrings, and customized or personalized items are non-returnable for hygiene reasons.',
        'returns'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'When will I receive my refund and do you offer exchanges?',
        'Approved refunds are processed to the original payment method within 7 to 10 business days after inspection. Shipping fees, customs duties, and handling charges are non-refundable. Direct exchanges are not offered, so customers should return the item for a refund and place a new order.',
        'refunds'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'What if my item is damaged, defective, or incorrect?',
        'Contact info@styledgenie.com immediately with photos if an item is damaged, defective, or incorrect. StyledGenie covers the return shipping cost and provides a full refund or replacement.',
        'returns'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'How can I contact support or use chat?',
        'Use the chat widget on styledgenie.com to track an order, open the shipping policy, or browse FAQs. Chat is available 24/7 and human agents step in during business hours for complex questions. You can also email info@styledgenie.com or call +49 17622511128.',
        'support'
    );

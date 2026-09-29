/* Reference dashboard samples stay separate from merchant and Shopify data. */
const collectionsReferenceBase = renderCatalogSection;
const referenceCollections = [
 ['Summer Essentials','AI',124,'Yesterday'],['Workwear','AI',91,'Yesterday'],
 ['Luxury Travel','Manual',42,'2 Days Ago'],['New Arrivals','AI',108,'3 Days Ago'],
 ['Sale Items','AI',45,'5 Days Ago'],['Date Night','AI',89,'1 Week Ago'],
 ['Party Essentials','Manual',8,'6/6/2025']
];
renderCatalogSection = function () {
 if (screenState.catalog !== 'collections') return collectionsReferenceBase();
 return screenTabs('catalog',[['products','Product'],['collections','Collections']],screenState.catalog) +
 `<div class="catalog-demo-bar"><span>${catalogUseDemo?'Demo collections &mdash; sample data':'Live Shopify collections'}</span><button class="secondary-button" type="button" data-catalog-source>${catalogUseDemo?'Show live collections':'Show demo collections'}</button></div>
 <section class="reference-collections"><h3>COLLECTIONS</h3><p>AI-powered collections that update automatically as your catalog changes</p>
 <div class="reference-collection-scroll"><table><thead><tr><th>Collection</th><th>Type</th><th>Products</th><th>Last updated</th><th>Auto sync</th></tr></thead><tbody>${catalogUseDemo?referenceCollections.map(([name,type,count,date])=>`<tr><td>${name}</td><td><span class="collection-type ${type==='AI'?'ai':''}">${type}</span></td><td>${count} Products</td><td>${date}</td><td>On</td></tr>`).join(''):'<tr><td colspan="5">Live collections are not available from the current catalog API.</td></tr>'}</tbody></table></div></section>`;
};
const liveAnalyticsReference = renderChatbotAnalyticsPage;
screenState.analytics = 'section1';
const referenceKpi = (value,label,change,tone='positive') => `<article class="reference-kpi"><strong>${value}</strong><span>${label}</span><small class="${tone}">${change}</small></article>`;
const referenceRank = (title,rows,unit) => `<article class="reference-ranking"><h4>${title}</h4><ol>${rows.map(([name,count])=>`<li><span>${name}</span><small>${count} ${unit}</small></li>`).join('')}</ol></article>`;
const referenceAnalyticsSection = (title,description,content) => `<section class="reference-analytics-section"><h3>${title}</h3><p>${description}</p><div class="reference-analytics-section-body">${content}</div></section>`;
renderChatbotAnalyticsPage = function(snapshot) {
 if(activeSection!=='analytics')return liveAnalyticsReference(snapshot);
 const tabs=screenTabs('analytics',[['section1','Section 1'],['section2','Section 2']],screenState.analytics);
 if(screenState.analytics==='section2')return tabs+'<p class="reference-data-note">Live analytics from your workspace</p>'+liveAnalyticsReference(snapshot);
 const looks=[['Weekend Linen Set','casual-cool-outfit.png','6.8%','$12.4K'],['Party look','soft-girl-outfit.png','5.9%','$9.7K'],['Summer Evening Look','summer-chic-outfit.png','5.1%','$8.2K']];
 const performance=`<h4>TOP PERFORMING AI-GENERATED LOOKS</h4><div class="reference-look-grid">${looks.map(([name,image,cvr,revenue])=>`<article class="reference-look"><img src="/storefront-widget-demo/assets/complete/${image}" alt="${name} sample outfit" loading="lazy"><div><h5>${name}</h5><p><span>${cvr}<small>CVR</small></span><span>${revenue}<small>Revenue</small></span></p></div></article>`).join('')}</div><div class="reference-rank-grid">${referenceRank('Most Recommended Products',[['Linen Wrap Shirt',842],['Tailored Wide-Leg Pants',719],['Classic Trench Coat',601],['Silk Slip Dress',548]],'suggestions')}${referenceRank('Most Purchased After AI Interaction',[['Linen Wrap Shirt',312],['Classic Trench Coat',266],['Leather Ankle Boots',204],['Tailored Wide-Leg Pants',187]],'purchases')}</div>`;
 const retention=`<div class="reference-kpi-grid three">${referenceKpi('2,104','AI-influenced repeat<br>purchases','+3% this week')}${referenceKpi('37%','Share of repeat purchases<br>AI-assisted','-2% pts this week','negative')}${referenceKpi('4.2x','Engagement frequency,<br>AI users','+2.1% this week','negative')}</div><h4>AVERAGE ORDER VALUE COMPARISON</h4><div class="reference-aov">${[['AI-Assisted',142],['Non AI-Assisted',98]].map(([label,value])=>`<div><span>${label}</span><div class="reference-bar"><span style="width:${value/185*100}%">$${value}</span></div></div>`).join('')}</div>`;
 const funnel=[['Chat Started &rarr; Product Viewed','8,412',76,'6,393 Viewed A Product (76%)','2,019 Dropped (24%)'],['Product Viewed &rarr; Added To Cart','6,393',58,'3,708 Added To Cart (58%)','2,685 Dropped (42%)'],['Added To Cart &rarr; Purchase Completed','3,708',71,'2,633 Purchased (71%)','1,075 Dropped (29%)']].map(([title,users,percent,success,drop])=>`<article class="reference-funnel"><header><span>${title}</span><small>${users} Users</small></header><div class="reference-bar" role="img" aria-label="${percent}% conversion"><span style="width:${percent}%"></span></div><footer><span class="positive">${success}</span><span class="negative">${drop}</span></footer></article>`).join('');
 return tabs+`<div class="reference-data-note">Demo analytics &mdash; reference figures. Section 2 shows live workspace data.</div><div class="reference-analytics">
 ${referenceAnalyticsSection('1. EXECUTIVE PERFORMANCE','An executive-level read on how AI is contributing to revenue and overall business performance.',`<div class="reference-kpi-grid">${referenceKpi('$184K','AI-influenced revenue','+18% this week')}${referenceKpi('+24%','CVR uplift vs non-AI sessions','+1% this week')}${referenceKpi('+12%','AOV uplift from AI recs','+3% this week')}${referenceKpi('41%','Orders with chatbot interaction','Stable','neutral')}</div>`)}
 ${referenceAnalyticsSection('2. PRODUCT &amp; LOOK PERFORMANCE','Which AI-generated looks, products, and recommendations are driving the most incremental sales.',performance)}
 ${referenceAnalyticsSection('3. CUSTOMER VALUE &amp; RETENTION','How AI is shaping engagement, loyalty, and lifetime value over time.',retention)}
 ${referenceAnalyticsSection('4. CUSTOMER JOURNEY FUNNEL','How customers move through the buying journey and where they drop off.',`<div class="reference-funnels">${funnel}<h4>FUNNEL INSIGHTS</h4><p class="reference-funnel-insight">Product view to cart has the largest drop-off: 42% of shoppers. Review product information and recommendation relevance at this step.</p></div>`)}
 </div>`;
};
sectionMeta.analytics = {title:'KPI & Analytics',subtitle:'A complete view of business performance, customer impact, and product insights'};

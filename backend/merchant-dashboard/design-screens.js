/* Reference screens reuse the existing API forms and save handlers. */
const screenState = {catalog:'products',knowledge:'knowledge',looks:'library',look:0,filter:'all',query:'',page:0};
const previousScreens = {catalog:renderCatalogSection,looks:renderLooksSection,knowledge:renderKnowledgeSection,chatbot:renderChatbotSection};
const screenTabs = (group, items, value) => `<nav class="reference-tabs" aria-label="${group} views">${items.map(([key,label])=>`<button type="button" class="reference-tab ${value===key?'active':''}" data-screen-group="${group}" data-screen-tab="${key}" aria-pressed="${value===key}">${label}</button>`).join('')}</nav>`;
const screenMetric = (label,value,note='') => `<article class="metric-card"><p class="metric-label">${escapeHtml(label)}</p><h3 class="metric-value">${escapeHtml(String(value))}</h3><p class="card-copy">${escapeHtml(note)}</p></article>`;
const screenEmpty = (title,copy) => `<div class="screen-empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div>`;
function screenField(label,name,value,kind='input') {
 return `<label class="field"><span>${label}</span>${kind==='textarea'?`<textarea name="${name}" rows="3">${escapeHtml(value||'')}</textarea>`:`<input name="${name}" value="${escapeHtml(value||'')}" />`}</label>`;
}
function screenSelect(label,name,options,value) {
 const list=[...new Set([value,...options].filter(Boolean))];
 return `<label class="field"><span>${label}</span><select name="${name}">${list.map(v=>`<option ${v===value?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`;
}
renderChatbotSection = function() {
 if(activeChatbotPage==='analytics') return renderChatbotAnalyticsPage(workspace.overview);
 const s=workspace.chatbot_customization;
 const builder=activeChatbotPage==='builder';
 const brand=`<div class="screen-form-group"><p class="control-group-title">Brand identity</p>${screenField('Brand name','brand_name',s.brand_name||workspace.profile.brand_name)}${screenField('Logo','logo_url',s.logo_url)}</div>
 <div class="screen-form-group"><p class="control-group-title">Color palette</p><div class="screen-palette">${[['primary_color','Primary'],['accent_color','Accent'],['surface_color','Surface'],['bubble_color','Bubble'],['text_color','Text']].map(([key,label])=>`<label title="${label}"><input type="color" name="${key}" value="${escapeHtml(s[key]||'#111111')}" aria-label="${label} color"><span>${label}</span></label>`).join('')}</div></div>
 <div class="screen-form-group"><p class="control-group-title">Typography</p><div class="form-grid screen-typography">${screenSelect('Primary text','heading_font',['Arial','Georgia','Playfair Display','Helvetica Neue'],s.heading_font)}${screenSelect('Heading style','primary_text_style',chatbotTextStyleOptions,s.primary_text_style)}${screenSelect('Body font','body_font',['Arial','Avenir Next','Helvetica Neue'],s.body_font)}${screenSelect('Body style','body_text_style',chatbotTextStyleOptions,s.body_text_style)}${screenSelect('Accent style','accent_text_style',chatbotTextStyleOptions,s.accent_text_style)}${screenSelect('Target market','target_market',chatbotTargetMarkets,s.target_market)}</div></div>`;
 const bot=`<div class="screen-form-group"><p class="control-group-title">Welcome message</p>${screenField('Headline','welcome_title',s.welcome_title)}${screenField('The first message shoppers see','welcome_message',s.welcome_message,'textarea')}</div>
 <div class="screen-form-group"><p class="control-group-title">Quick actions</p><p class="card-copy">One suggested prompt per line.</p>${screenField('Suggested prompts','suggested_prompts',(s.suggested_prompts||[]).join('\n'),'textarea')}</div>
 <div class="screen-form-group"><p class="control-group-title">Bot name & personality</p>${screenField('Bot name','assistant_name',s.assistant_name)}<div class="screen-tones">${['Friendly','Professional','Playful','Luxury','Minimal','Witty'].map(t=>`<button type="button" class="secondary-button" data-screen-tone="${t}">${t}</button>`).join('')}</div>${screenField('Tone of voice','tone_of_voice',s.tone_of_voice,'textarea')}${screenField('Stylist signature','stylist_signature',s.stylist_signature,'textarea')}</div>`;
 return `<section>${renderChatbotModuleNav()}<div class="reference-customizer"><form id="chatbotForm" class="section-form"><div ${builder?'hidden':''}>${brand}</div><div ${builder?'':'hidden'}>${bot}</div></form>
 <aside class="reference-preview"><p class="control-group-title">Preview</p><div class="reference-devices">${['phone','tablet','desktop'].map(d=>`<button type="button" data-preview-size="${d}" aria-pressed="${d==='tablet'}" aria-label="${d} preview" title="${d} preview"><span class="device-symbol device-symbol-${d}" aria-hidden="true"></span></button>`).join('')}</div>
 <div class="reference-device" data-device="tablet"><div id="chatbotPreviewShell" class="screen-chat-preview"><header><span id="chatbotPreviewLogo">${escapeHtml(getBrandInitials(s.brand_name||'SG'))}</span><strong id="chatbotPreviewAssistantName">${escapeHtml(s.assistant_name)}</strong></header><div class="screen-chat-body"><small id="chatbotPreviewBrandName">${escapeHtml(s.brand_name||workspace.profile.brand_name)}</small><h3 id="chatbotPreviewWelcomeTitle">${escapeHtml(s.welcome_title)}</h3><p id="chatbotPreviewWelcomeMessage">${escapeHtml(s.welcome_message)}</p><div id="chatbotPreviewPrompts">${(s.suggested_prompts||[]).map(p=>`<span class="screen-prompt">${escapeHtml(p)}</span>`).join('')}</div></div></div></div><button class="primary-button" form="chatbotForm" type="submit">Save changes</button><p class="card-copy">Changes apply to your connected storefront.</p></aside></div></section>`;
};
function productIssues(p){return [!p.image_url?'No image':'',!(p.tags||[]).length?'Missing tags':'',p.inventory_quantity===0?'Out of stock':''].filter(Boolean)}
renderCatalogSection = function() {
 const tabs=screenTabs('catalog',[['products','Product'],['collections','Collections'],['rules','Catalog rules']],screenState.catalog);
 if(screenState.catalog==='rules')return tabs+previousScreens.catalog();
 if(screenState.catalog==='collections')return tabs+`<p class="control-group-title">Collections</p><p class="card-copy">Shopify collections and their sync status.</p><div class="screen-table-wrap"><table><thead><tr><th>Collection</th><th>Type</th><th>Products</th><th>Last updated</th><th>Auto sync</th></tr></thead><tbody><tr><td colspan="5">Collections are not included in the current catalog API.</td></tr></tbody></table></div>`;
 const all=catalogProductOptions;
 const tagged=all.filter(p=>(p.tags||[]).length).length;
 const images=all.filter(p=>p.image_url).length;
 const needs=all.filter(p=>productIssues(p).length).length;
 const filtered=all.filter(p=>(screenState.filter==='all'||productIssues(p).length)&&`${p.title} ${p.category} ${p.sku||''}`.toLowerCase().includes(screenState.query.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/12));screenState.page=Math.min(screenState.page,pages-1);
 const rows=filtered.slice(screenState.page*12,screenState.page*12+12);
 return tabs+`<div class="metric-grid">${screenMetric('Products',all.length,'Connected catalog')}${screenMetric('Tag coverage',all.length?Math.round(tagged/all.length*100)+'%':'—','Products with tags')}${screenMetric('Image coverage',all.length?Math.round(images/all.length*100)+'%':'—','Products with an image')}${screenMetric('Needs review',needs,'Missing data or unavailable')}</div>
 <div class="screen-toolbar"><strong>Products <small>${all.length} items</small></strong><button class="secondary-button" data-product-filter="all" aria-pressed="${screenState.filter==='all'}">All products</button><button class="secondary-button" data-product-filter="review" aria-pressed="${screenState.filter==='review'}">Needs review</button><label class="screen-search">Search products<input id="screenProductSearch" value="${escapeHtml(screenState.query)}" placeholder="Name, category or SKU"></label></div>
 <div class="screen-table-wrap"><table class="screen-product-table"><thead><tr><th>Product</th><th>Inventory</th><th>Issues</th><th>Tags</th><th>Price</th><th>Action</th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="screen-product-name">${p.image_url?`<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy">`:'<span class="screen-product-placeholder"></span>'}<div>${escapeHtml(p.title)}<small>${escapeHtml(p.sku||p.category)}</small></div></div></td><td>${p.inventory_quantity??'—'}</td><td>${productIssues(p).map(i=>`<span class="screen-badge warning">${i}</span>`).join('')||'<span class="screen-badge good">Complete</span>'}</td><td>${(p.tags||[]).slice(0,3).map(t=>`<span class="screen-badge">${escapeHtml(t)}</span>`).join('')||'—'}</td><td>${escapeHtml(p.price?formatPrice(p.price):'—')}</td><td>${p.product_url?`<a class="secondary-button" href="${escapeHtml(p.product_url)}" target="_blank" rel="noopener noreferrer">View product</a>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">No matching products. Sync your catalog or change the search.</td></tr>'}</tbody></table></div>
 <div class="screen-toolbar"><small>Page ${screenState.page+1} of ${pages} · ${filtered.length} products</small><div class="screen-pagination"><button class="secondary-button" data-product-page="-1" ${screenState.page===0?'disabled':''}>Previous</button><button class="primary-button" data-product-page="1" ${screenState.page+1===pages?'disabled':''}>Next</button></div></div>`;
};
function renderLookKnowledgeGaps() {
 const looks=workspace.looks||[];
 const gaps=[];
 if(!looks.length){
  gaps.push({title:'No looks have been created',detail:'Build a look from products in your catalog to give shoppers complete outfit recommendations.',count:1,action:'Create a look',target:'editor'});
 } else {
  const noOccasion=looks.map((look,index)=>({look,index})).filter(item=>!String(item.look.occasion||'').trim());
  const noNotes=looks.map((look,index)=>({look,index})).filter(item=>!String(item.look.style_notes||'').trim());
  if(noOccasion.length)gaps.push({title:'Looks missing an occasion',detail:'Add an occasion so the stylist can surface each look in the right shopping moment.',count:noOccasion.length,items:noOccasion});
  if(noNotes.length)gaps.push({title:'Looks missing styling guidance',detail:'Add a short styling note to explain the color story, silhouette, and why the look works.',count:noNotes.length,items:noNotes});
 }
 return `<section class="look-gap-screen"><header class="look-gap-heading"><div><p class="card-eyebrow">Look management</p><h2>Knowledge gaps</h2><p>Understand where look details are missing and fix the root cause.</p></div><button class="primary-button" data-screen-group="looks" data-screen-tab="editor">+ Create Look</button></header><nav class="reference-tabs" aria-label="Look management views"><button type="button" class="reference-tab active" data-screen-group="looks" data-screen-tab="gaps" aria-pressed="true">Knowledge gaps</button><button type="button" class="reference-tab" data-screen-group="looks" data-screen-tab="library" aria-pressed="false">Look library</button><button type="button" class="reference-tab" data-screen-group="looks" data-screen-tab="settings" aria-pressed="false">Merchant controls</button></nav><div class="look-gap-summary"><strong>${gaps.reduce((sum,gap)=>sum+gap.count,0)}</strong><span>gaps to review</span><small>${looks.length} saved ${looks.length===1?'look':'looks'} checked</small></div>${gaps.length?`<div class="look-gap-list">${gaps.map(gap=>`<article class="look-gap-card"><span class="look-gap-count">${gap.count}</span><div><h3>${escapeHtml(gap.title)}</h3><p>${escapeHtml(gap.detail)}</p>${gap.items?`<ul>${gap.items.slice(0,5).map(({look,index})=>`<li><span>${escapeHtml(look.title||'Untitled look')}</span><button class="overview-text-link" data-look-detail="${index}">Review</button></li>`).join('')}</ul>`:''}</div><button class="secondary-button" data-screen-group="looks" data-screen-tab="${gap.target||'editor'}">${gap.action||'Add guidance'}</button></article>`).join('')}</div>`:`<div class="screen-empty"><h3>No look knowledge gaps</h3><p>Your saved looks include an occasion and styling guidance. New gaps will appear here if details are missing.</p><button class="secondary-button" data-screen-group="looks" data-screen-tab="library">Review look library</button></div>`}</section>`;
}

renderLooksSection = function() {
 const tabs=screenTabs('looks',[['library','Look library'],['gaps','Knowledge gaps'],['editor','Create & edit'],['settings','Merchant controls']],screenState.looks);
 if(screenState.looks==='gaps')return tabs+renderLookKnowledgeGaps();
 if(screenState.looks==='editor')return tabs+previousScreens.looks();
 if(screenState.looks==='settings')return tabs+`<h3>Look Management Settings</h3><p class="card-copy">Set recommendation priorities and styling constraints in your existing catalog rules.</p>`+previousScreens.catalog();
 const looks=workspace.looks||[];
 if(screenState.looks==='detail'){
  const look=looks[screenState.look];if(!look)return tabs+screenEmpty('Look unavailable','Return to the library to select a saved look.');
  return tabs+`<button class="ghost-button" data-screen-group="looks" data-screen-tab="library">? Back to library</button><div class="screen-detail"><article><p class="control-group-title">Saved look</p><h2>${escapeHtml(look.title)}</h2><span class="screen-badge">${escapeHtml(look.occasion||'Any occasion')}</span><div class="screen-look-art"><span>${escapeHtml(getBrandInitials(look.title))}</span></div><h3>Why this works</h3><p class="screen-notes">${escapeHtml(look.style_notes||'Add styling notes in the editor.')}</p></article><aside class="workspace-card"><h3>Performance</h3><p class="card-copy">Per-look impressions, conversions, and product associations are not recorded by the current backend.</p><button class="primary-button" data-screen-group="looks" data-screen-tab="editor">Edit looks</button></aside></div>`;
 }
 return tabs+`<div class="metric-grid">${screenMetric('Saved looks',looks.length)}${screenMetric('Occasions',new Set(looks.map(l=>l.occasion).filter(Boolean)).size)}${screenMetric('Conversion rate','—','Not tracked per look')}${screenMetric('Revenue','—','Not tracked per look')}</div><div class="screen-toolbar"><h3>Your look library</h3><button class="primary-button" data-screen-group="looks" data-screen-tab="editor">+ Create look</button></div><div class="screen-look-grid">${looks.map((l,i)=>`<button class="screen-look-card" data-look-detail="${i}"><div class="screen-look-art art-${i%3}"><span>${escapeHtml(getBrandInitials(l.title))}</span></div><div class="screen-look-caption"><h3>${escapeHtml(l.title)}</h3><span class="screen-badge">${escapeHtml(l.occasion||'Any occasion')}</span><p>${escapeHtml(l.style_notes||'No styling notes yet')}</p><span>View look ?</span></div></button>`).join('')||screenEmpty('Build your first look','Choose Create look to generate outfits from a catalog product.')}</div>`;
};
renderKnowledgeSection = function() {
 const tabs=screenTabs('knowledge',[['knowledge','Knowledge gaps'],['insights','Conversation insights'],['products','Product training'],['controls','Learning controls']],screenState.knowledge);
 const entries=workspace.knowledge_base||[];const snapshot=workspace.overview;
 if(screenState.knowledge==='controls')return tabs+previousScreens.knowledge();
 if(screenState.knowledge==='insights')return tabs+`<h3>Conversation insights</h3><p class="card-copy">Intent distribution from recorded shopper activity.</p>`+renderServiceMix(snapshot)+renderActivityFeed(snapshot);
 if(screenState.knowledge==='products'){
 const total=catalogProductOptions.length;const tagged=catalogProductOptions.filter(p=>(p.tags||[]).length).length;const pct=total?Math.round(tagged/total*100):0;
 return tabs+`<h3>Product training & tagging</h3><p class="card-copy">Catalog tag coverage. This measures available product data, not model training completion.</p><div class="screen-training-progress"><strong>${pct}%</strong><p>Products with tags</p><progress max="100" value="${pct}">${pct}%</progress><div class="screen-toolbar"><small>${tagged} tagged</small><small>${total-tagged} without tags</small></div></div><div class="panel-grid"><article class="workspace-card"><h3>Brand knowledge</h3>${entries.map(e=>`<div class="screen-list-row"><span>${escapeHtml(e.title)}</span><span class="screen-badge">${escapeHtml(e.entry_type)}</span></div>`).join('')||'<p>No training entries saved.</p>'}</article><article class="workspace-card"><h3>Catalog review</h3><p class="card-copy">Review missing tags and images in Catalog Intelligence.</p><button class="secondary-button" data-action="navigate-section" data-target="catalog">Review products</button></article></div>`;
 }
 return tabs+`<div class="metric-grid">${screenMetric('Knowledge entries',entries.length)}${screenMetric('FAQ answers',workspace.customer_care.length)}${screenMetric('Catalog coverage',getCoverage(snapshot)+'%')}${screenMetric('Saved looks',workspace.looks.length)}</div><div class="screen-toolbar"><h3>Brand knowledge & guidance</h3><button class="primary-button" data-screen-group="knowledge" data-screen-tab="controls">Add / edit knowledge</button></div>${entries.map(e=>`<article class="screen-knowledge-row"><div><h3>${escapeHtml(e.title)}</h3><span class="screen-badge">${escapeHtml(e.entry_type)}</span><p>${escapeHtml(e.body)}</p></div><button class="secondary-button" data-screen-group="knowledge" data-screen-tab="controls">Review</button></article>`).join('')||screenEmpty('No brand knowledge yet','Add guidance to help the stylist explain and recommend consistently.')}`;
};
mainContent.addEventListener('click',event=>{
 const tab=event.target.closest('[data-screen-group]');
 if(tab){screenState[tab.dataset.screenGroup]=tab.dataset.screenTab;renderSection();return;}
 const tone=event.target.closest('[data-screen-tone]');
 if(tone){const input=mainContent.querySelector('[name="tone_of_voice"]');input.value=tone.dataset.screenTone;input.dispatchEvent(new Event('input',{bubbles:true}));return;}
 const filter=event.target.closest('[data-product-filter]');if(filter){screenState.filter=filter.dataset.productFilter;screenState.page=0;renderSection();return;}
 const page=event.target.closest('[data-product-page]');if(page){screenState.page+=Number(page.dataset.productPage);renderSection();return;}
 const detail=event.target.closest('[data-look-detail]');if(detail){screenState.look=Number(detail.dataset.lookDetail);screenState.looks='detail';renderSection();}
});
mainContent.addEventListener('change',event=>{if(event.target.id==='screenProductSearch'){screenState.query=event.target.value;screenState.page=0;renderSection();}});
const previousWire=wireActiveSection;
wireActiveSection=function(){previousWire();if(activeSection==='chatbot'){setupChatbotLivePreview();}};

mainContent.addEventListener('submit',event=>{
 const form=event.target;
 const handlers={
  chatbotForm:()=>saveSection('/api/merchant/chatbot-customization',collectChatbotPayload(form),'Chatbot settings saved'),
  catalogForm:()=>saveSection('/api/merchant/catalog-intelligence',collectCatalogPayload(form),'Catalog rules saved'),
  looksForm:()=>saveSection('/api/merchant/look-management',{items:collectLookItems()},'Looks saved'),
  careForm:()=>saveSection('/api/merchant/customer-care',{items:collectCustomerCareItems(),settings:collectCustomerCareSettings(form)},'Support settings saved'),
  knowledgeForm:()=>saveSection('/api/merchant/knowledge-base',{items:collectKnowledgeItems()},'Knowledge saved'),
  lookBuilderForm:()=>generateLookBuilderDrafts(),
  descriptionGeneratorForm:()=>generateProductDescriptionDraft()
 };
 if(handlers[form.id]){event.preventDefault();handlers[form.id]();}
});
mainContent.addEventListener('change',event=>{
 if(event.target.id==='lookBuilderProductSelect') selectedLookBuilderHeroId=event.target.value;
 if(event.target.id==='lookBuilderOccasionInput') lookBuilderOccasionHint=event.target.value;
 if(event.target.id==='descriptionProductSelect') selectedDescriptionProductId=event.target.value;
});
renderOverviewSection = function() {
 const s=workspace.overview, products=catalogProductOptions;
 const coverage=getCoverage(s);
 const missing=products.filter(p=>!p.image_url).length;
 const untagged=products.filter(p=>!(p.tags||[]).length).length;
 const bar=(label,value)=>`<div class="overview-health-row"><div><span>${label}</span><strong>${value}%</strong></div><progress max="100" value="${value}">${value}%</progress></div>`;
 const heading=(title,target,label)=>`<div class="overview-panel-heading"><h3>${title}</h3><button class="overview-link" data-action="navigate-section" data-target="${target}">${label} ?</button></div>`;
 return `<section class="overview-reference"><div class="metric-grid overview-metrics">${screenMetric('Stylist sessions',formatNumber(s.chat_sessions||0),'Recorded sessions')}${screenMetric('Outfits',formatNumber(s.overview.outfit_recommendations||0),'Outfit recommendations')}${screenMetric('Catalog coverage',coverage+'%','Tagged products')}${screenMetric('Add-to-cart events',formatNumber(s.add_to_cart_count||0),'Recorded shopping actions')}</div>
 <div class="overview-reference-grid"><article class="workspace-card">${heading('AI health','knowledge','Configure')}${bar('Catalog tag coverage',coverage)}${bar('Product images',products.length?Math.round((products.length-missing)/products.length*100):0)}<div class="overview-data-row"><span>Brand knowledge</span><strong>${workspace.knowledge_base.length} entries</strong></div><div class="overview-data-row"><span>Support answers</span><strong>${workspace.customer_care.length} FAQs</strong></div></article>
 <article class="workspace-card">${heading('Saved looks','looks','All looks')}<div class="overview-look-list">${workspace.looks.slice(0,4).map((l,i)=>`<button class="overview-look" data-overview-look="${i}"><span class="overview-look-thumb">${escapeHtml(getBrandInitials(l.title))}</span><span><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.occasion||'All occasions')}</small></span><span class="overview-look-arrow">?</span></button>`).join('')||'<p class="empty-copy">No looks saved yet. Create your first look in Look Management.</p>'}</div></article>
 <article class="workspace-card">${heading('Store health','catalog','Manage')}<div class="overview-data-row"><span>Total products</span><strong>${formatNumber(s.products_imported||0)}</strong></div><div class="overview-data-row"><span>Missing images</span><span class="overview-count">${missing} items</span></div><div class="overview-data-row"><span>Missing tags</span><span class="overview-count muted">${untagged} items</span></div><div class="overview-data-row"><span>Last synced</span><small>${escapeHtml(s.last_catalog_sync?formatTimestamp(s.last_catalog_sync):'Not synced')}</small></div></article>
 <article class="workspace-card overview-activity"><div class="overview-panel-heading"><h3>Recent activity</h3><span class="screen-badge good">Live</span></div>${(s.recent_activity||[]).slice(0,4).map(a=>`<div class="overview-activity-row"><span class="overview-dot"></span><div><p>${escapeHtml(a.title)}</p><small>${escapeHtml(formatTimestamp(a.timestamp))}</small></div></div>`).join('')||'<div class="overview-activity-row"><span class="overview-dot"></span><p>No AI activity recorded yet.</p></div>'}</article></div>${renderOverviewCharts()}</section>`;
};
mainContent.addEventListener('click',event=>{
 const item=event.target.closest('[data-overview-look]');
 if(item){activeSection='looks';screenState.looks='detail';screenState.look=Number(item.dataset.overviewLook);updateShellChrome();renderSection();}
});

// Local demo fixtures only; never sent to Shopify or used for shopper recommendations.
const catalogDemoProducts = [
 ['headphones','Wireless Noise-Cancelling Headphones','SKU-1042','Electronics',38,42,['Tech','Lifestyle'],[['No image','critical'],['No description','critical']]],
 ['desk','Standing Desk ? Pro Series','SKU-0887','Furniture',64,95,['Workwear','Formal'],[['Specs outdated','review']]],
 ['software','Microsoft','SKU-2201','Software',96,98,['Tech','Travel'],[]],
 ['chair','Ergonomic Office Chair','SKU-0654','Furniture',89,91,['Tech','Lifestyle','Travel'],[]],
 ['webcam','4K Webcam Pro','SKU-3310','Electronics',71,68,['Formal','Lifestyle'],[['Short desc.','review']]],
 ['backup','Cloud Backup ? Business','SKU-1188','Software',45,10,['Summer','Cotton'],[['No pricing','critical'],['No image','critical']]],
 ['keyboard','Mechanical Keyboard ? RGB','SKU-2890','Electronics',91,82,['Winter','Lifestyle','Thick'],[]],
 ...[67,72,48,90,55,93].map((confidence,index)=>['dock-'+index,'USB-C Docking Station','SKU-'+(4120+index),'Electronics',68,confidence,['Tech','Lifestyle'],[['Missing tags','review']]])
].map(([id,title,sku,category,health,confidence,tags,issues])=>({id:'demo-'+id,title,sku,category,tags,demo:true,health,confidence,issues}));
let catalogUseDemo=true;
function catalogVisibleProducts(){return catalogUseDemo?catalogDemoProducts:catalogProductOptions;}
const catalogReferenceBase=renderCatalogSection;
let catalogSort='health';
function catalogRowHealth(product){
 if(product.demo)return {product,issues:product.issues,score:product.health,critical:product.issues.some(issue=>issue[1]==='critical')};
 const issues=[];
 if(!product.image_url)issues.push(['No image','critical']);
 if(product.price==null||String(product.price).trim()==='')issues.push(['No pricing','critical']);
 if(!(product.tags||[]).length)issues.push(['Missing tags','review']);
 if(!product.category)issues.push(['No category','review']);
 const score=100-issues.reduce((n,item)=>n+(item[1]==='critical'?30:20),0);
 return {product,issues,score,critical:issues.some(i=>i[1]==='critical')};
}
renderCatalogSection=function(){
 if(screenState.catalog!=='products')return catalogReferenceBase();
 const tabs=screenTabs('catalog',[['products','Product'],['collections','Collections']],screenState.catalog);
 const all=catalogVisibleProducts().map(catalogRowHealth);
 const average=catalogUseDemo?82:all.length?Math.round(all.reduce((n,p)=>n+p.score,0)/all.length):null;
 const tagged=all.filter(row=>(row.product.tags||[]).length).length;
 let rows=all.filter(row=>(screenState.filter==='all'||(screenState.filter==='critical'?row.critical:row.issues.length>0))&&`${row.product.title} ${row.product.sku||''} ${row.product.category||''}`.toLowerCase().includes(screenState.query.toLowerCase()));
 rows.sort((a,b)=>catalogSort==='name'?a.product.title.localeCompare(b.product.title):catalogSort==='health-desc'?b.score-a.score:a.score-b.score);
 const count=rows.length,pages=Math.max(1,Math.ceil(count/12));screenState.page=Math.max(0,Math.min(screenState.page,pages-1));rows=rows.slice(screenState.page*12,screenState.page*12+12);
 const metric=(label,value,note,ring=false)=>`<article class="catalog-summary"><h3>${label}</h3><strong>${value}</strong><p>${note}</p>${ring?`<span class="catalog-health-ring" style="--health:${average||0}%" role="img" aria-label="Catalog completeness ${average??0} out of 100"></span>`:''}</article>`;
 return `<section class="catalog-reference">${tabs}<div class="catalog-demo-bar"><span>${catalogUseDemo?'Demo catalog &mdash; sample products and scores, not Shopify inventory.':'Live Shopify catalog'}</span><button type="button" class="secondary-button" data-catalog-source>${catalogUseDemo?'Show live products':'Show demo products'}</button></div><div class="catalog-summary-grid">${catalogUseDemo
 ? metric('Catalog health score','82<small>/100</small>','&uarr; +2 pts this week',true)
   +metric('AI enrichment coverage','66%','127 items still queued')
   +metric('Tagging accuracy','93.4%','&uarr; +1.2% vs last month')
   +metric('New tags this week','42','&uarr; 8 more than last week')
 : metric('Catalog health score',average===null?'&mdash;':average+'<small>/100</small>','Based on image, price, tags and category',average!==null)
   +metric('Tag coverage',all.length?Math.round(tagged/all.length*100)+'%':'&mdash;',`${all.length-tagged} products without tags`)
   +metric('Tagging accuracy','&mdash;','Not measured yet')
   +metric('New tags this week','&mdash;','Tag history is not available')}</div>
 <div class="catalog-reference-toolbar"><strong>Products <span>${all.length.toLocaleString()} items</span></strong><div class="catalog-filter-group">${[['all','All products'],['critical','Critical'],['review','Needs review']].map(([key,label])=>`<button type="button" data-product-filter="${key}" aria-pressed="${screenState.filter===key}">${key!=='all'?`<i class="catalog-dot ${key}"></i>`:''}${label}</button>`).join('')}</div><label class="catalog-sort"><span class="catalog-sr-only">Sort products</span><select id="catalogReferenceSort">${[['health','Health score: low first'],['health-desc','Health score: high first'],['name','Product name']].map(([value,label])=>`<option value="${value}" ${catalogSort===value?'selected':''}>Sort: ${label}</option>`).join('')}</select></label></div>

 <div class="catalog-reference-scroll" tabindex="0" aria-label="Product catalog"><table class="catalog-reference-table"><thead><tr><th>Product</th><th title="Completeness of image, price, tags and category">Health</th><th>Issues</th><th>Product tags</th><th>Tag confidence</th><th>Enrichment</th></tr></thead><tbody>${rows.map(({product:p,issues,score,critical})=>`<tr><td><div class="catalog-row-product">${p.image_url?`<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy">`:'<span class="catalog-image-placeholder"></span>'}<div><strong>${escapeHtml(p.title)}</strong><small>${escapeHtml(p.sku||'No SKU')} &middot; ${escapeHtml(p.category||'Uncategorized')}</small></div></div></td><td><span class="catalog-row-score"><i class="catalog-dot ${critical?'critical':issues.length?'review':'healthy'}"></i>${score}</span></td><td>${issues.map(([label,severity])=>`<span class="catalog-issue ${severity}">${label}</span>`).join('')||'<span class="catalog-unavailable">&mdash;</span>'}</td><td>${(p.tags||[]).slice(0,3).map(tag=>`<span class="catalog-tag">${escapeHtml(tag)}</span>`).join('')||'&mdash;'}</td><td class="catalog-confidence ${p.demo?(p.confidence>=80?'demo-confident':'demo-review'):''}"><strong>${p.demo?p.confidence+'%':'&mdash;'}</strong><small>${p.demo?(p.confidence>=80?'Confident':'Review needed'):'Not measured'}</small></td><td><button type="button" class="${critical?'primary-button':'secondary-button'}" data-catalog-review="${escapeHtml(p.id)}">${issues.length?'Review product':'View details'}</button></td></tr>`).join('')||'<tr><td colspan="6" class="catalog-no-results">No products match these filters.</td></tr>'}</tbody></table></div>
 <details class="catalog-tools"><summary>Search &amp; catalog settings</summary><div class="catalog-search-row"><label>Search <input id="screenProductSearch" value="${escapeHtml(screenState.query)}" placeholder="Name, SKU or category"></label><button class="ghost-button" data-screen-group="catalog" data-screen-tab="rules">Catalog rules</button></div></details>
 <div class="screen-toolbar"><small>${count?screenState.page*12+1:0}&ndash;${Math.min((screenState.page+1)*12,count)} of ${count} products</small><div class="screen-pagination"><button type="button" class="secondary-button" data-product-page="-1" ${screenState.page===0?'disabled':''}>Previous</button><button type="button" class="primary-button" data-product-page="1" ${screenState.page+1>=pages?'disabled':''}>Next</button></div></div></section>`;
};
mainContent.addEventListener('change',event=>{if(event.target.id==='catalogReferenceSort'){catalogSort=event.target.value;screenState.page=0;renderSection();}});
mainContent.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-catalog-review]');if(!trigger)return;
 const p=catalogVisibleProducts().find(product=>product.id===trigger.dataset.catalogReview);if(!p)return;
 const {issues,score}=catalogRowHealth(p);
 const dialog=document.createElement('dialog');dialog.className='catalog-detail-dialog';
 dialog.innerHTML=`<div class="catalog-dialog-header"><h2>${escapeHtml(p.title)}</h2><button type="button" aria-label="Close product details">&times;</button></div><p>Catalog completeness: ${score}/100</p><p>${issues.length?issues.map(i=>escapeHtml(i[0])).join(' &middot; '):'Image, price, category and tags are present.'}</p><dl><dt>SKU</dt><dd>${escapeHtml(p.sku||'Not available')}</dd><dt>Category</dt><dd>${escapeHtml(p.category||'Not available')}</dd><dt>Tags</dt><dd>${escapeHtml((p.tags||[]).join(', ')||'No tags')}</dd></dl><p>${p.demo?'Demo product for dashboard preview only. No Shopify product will be changed.':'Update missing product information in Shopify, then sync your catalog.'}</p>${/^https?:\/\//i.test(p.product_url||'')?`<a href="${escapeHtml(p.product_url)}" target="_blank" rel="noopener noreferrer" class="secondary-button">View storefront product</a>`:''}`;
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();});document.body.appendChild(dialog);dialog.showModal();
});
sectionMeta.catalog.subtitle='Review product health, catalog coverage, and opportunities to improve recommendations';

mainContent.addEventListener('click',event=>{
 if(!event.target.closest('[data-catalog-source]'))return;
 catalogUseDemo=!catalogUseDemo;screenState.filter='all';screenState.query='';screenState.page=0;renderSection();
});

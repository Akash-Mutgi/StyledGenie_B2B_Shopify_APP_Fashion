/* Detailed brand editor, retaining the existing form and API contract. */
const brandBaseRender=renderChatbotSection;
const brandBaseCollect=collectChatbotPayload;
collectChatbotPayload=function(form){
 const value=brandBaseCollect(form);
 const s=workspace.chatbot_customization;
 for(const name of ['accent_font','avatar_url','avatar_preset','bubble_shape','widget_position']) value[name]=form.elements[name]?.value||s[name]||({accent_font:'Inter',avatar_preset:'genie',bubble_shape:'square',widget_position:'bottom-right'}[name])||'';
 for(const name of ['primary_text_size','accent_text_size','body_text_size']) value[name]=Number(form.elements[name]?.value||s[name]||12);
 const checks=form.querySelectorAll('[name="page_visibility"]');
 value.page_visibility=checks.length?Array.from(checks).filter(x=>x.checked).map(x=>x.value):(s.page_visibility||['home','category']);
 return value;
};
renderChatbotSection=function(){
 const markup=brandBaseRender();
 if(activeChatbotPage==='analytics')return markup;
 const template=document.createElement('template');template.innerHTML=markup;
 const root=template.content;
 const form=root.querySelector('#chatbotForm');
 if(!form)return markup;
 const s=workspace.chatbot_customization;
 const brand=form.children[0];
 brand.classList.add('exact-brand');
 const groups=brand.querySelectorAll('.screen-form-group');
 const typography=(label,font,fontValue,style,styleValue,size,defaultSize)=>`<div class="brand-type-row"><span>${label}</span><div>${screenSelect(label+' font',font,['Inter','Playfair Display','Arial','Georgia','Helvetica Neue'],fontValue)}${screenSelect(label+' weight',style,chatbotTextStyleOptions,styleValue)}${screenSelect(label+' size',size,['4','10','11','12','14','16','18','20','24','32'],String(s[size]||defaultSize))}</div></div>`;
 groups[2].innerHTML=`<p class="control-group-title">Typography</p>${typography('Primary text','heading_font',s.heading_font,'primary_text_style',s.primary_text_style,'primary_text_size',12)}${typography('Accent text','accent_font',s.accent_font||'Inter','accent_text_style',s.accent_text_style,'accent_text_size',11)}${typography('Body text','body_font',s.body_font,'body_text_style',s.body_text_style,'body_text_size',14)}<div hidden>${screenSelect('Market','target_market',chatbotTargetMarkets,s.target_market)}</div>`;
 groups[1].classList.add('brand-colors');
 groups[1].querySelector('.screen-palette').hidden=true;
 groups[1].insertAdjacentHTML('beforeend',`<div class="brand-reference-palette" aria-label="Primary color presets">${[['#f58a1c','Orange'],['#f4d98a','Yellow'],['#e46186','Pink'],['#6497cd','Blue']].map(([color,label])=>`<button type="button" class="brand-color-preset" data-brand-color="${color}" style="background:${color}" aria-label="Use ${label} as primary color" aria-pressed="${s.primary_color===color}"></button>`).join('')}<button type="button" class="brand-color-add" aria-label="Edit custom palette" aria-expanded="false">+</button></div>`);

 groups[1].insertAdjacentHTML('beforeend','<div class="brand-scan"><span>or</span><button type="button" class="secondary-button" disabled title="Logo palette extraction is not connected yet"><span class="brand-scan-icon" aria-hidden="true"></span>Scan logo with AI</button></div>');
 const selected=s.avatar_preset||'genie';
 brand.insertAdjacentHTML('beforeend',`<div class="brand-avatar-shape"><div><p class="control-group-title">Bot avatar</p><div class="brand-avatars">${['genie','classic','warm','blue'].map((key,i)=>`<label class="brand-avatar avatar-${key}" title="${key}"><input type="radio" name="avatar_preset" value="${key}" ${selected===key?'checked':''}><img src="${escapeHtml(s.avatar_url && selected===key ? s.avatar_url : "./assets/avatars/"+key+".svg")}" alt="${key} avatar"></label>`).join('')}<label class="brand-upload-plus" title="Upload avatar">+<input type="file" accept="image/png,image/jpeg,image/webp" data-brand-upload hidden></label></div><div class="brand-scan"><span>or</span><label class="secondary-button brand-upload">&#8613; &nbsp; Upload avatar image<input type="file" accept="image/png,image/jpeg,image/webp" data-brand-upload hidden></label></div><input name="avatar_url" type="hidden" value="${escapeHtml(s.avatar_url||'')}"><p class="brand-hint">Click a preset or upload an image (PNG, 64×64 recommended)</p></div><div><p class="control-group-title">Chat bubble shape</p><div class="brand-shapes">${['square','pill','rounded'].map(shape=>`<label><input type="radio" name="bubble_shape" value="${shape}" ${(s.bubble_shape||'square')===shape?'checked':''}><span class="shape-sample shape-${shape}"></span><span>${shape[0].toUpperCase()+shape.slice(1)}</span></label>`).join('')}</div></div></div>
 <div class="screen-form-group"><p class="control-group-title">Widget position</p><div class="brand-positions">${['top-left','top-right','bottom-left','bottom-right'].map(pos=>`<label><input type="radio" name="widget_position" value="${pos}" ${(s.widget_position||'bottom-right')===pos?'checked':''}><span>${pos.replace('-',' ')}</span></label>`).join('')}</div></div>
 <div class="screen-form-group"><p class="control-group-title">Page visibility <span class="brand-hint">(Select which pages show the chatbot widget)</span></p><div class="brand-pages">${[['home','Home page'],['product','Product page'],['category','Category page'],['cart','Cart & Checkout'],['all','All pages']].map(([value,label])=>`<label><input type="checkbox" name="page_visibility" value="${value}" ${(s.page_visibility||['home','category']).includes(value)?'checked':''}>${label}</label>`).join('')}</div></div>`);
 const preview=root.querySelector('.reference-preview');
 preview.insertAdjacentHTML('beforeend','<details class="brand-history"><summary>&#8634; Version history</summary><p>No version history is stored yet. Saving updates the current configuration.</p></details>');
 root.querySelectorAll('.brand-type-row select[name$="_style"] option').forEach(option=>{option.textContent=option.textContent.replace(/^\d+\s*/, '');});
 preview.classList.add('exact-preview');
 return template.innerHTML;
};
mainContent.addEventListener('change',event=>{
 if(!event.target.matches('[data-brand-upload]'))return;
 const file=event.target.files[0];if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){showToast('Choose another image','Use a PNG, JPG or WebP under 1 MB.','error');return;}
 const reader=new FileReader();reader.onload=()=>{
 const form=document.getElementById('chatbotForm');if(!form)return;
 form.elements.avatar_url.value=reader.result;
 const chosen=form.querySelector('.brand-avatar input:checked');
 if(chosen)chosen.parentElement.querySelector('img').src=reader.result;
 form.dispatchEvent(new Event('input',{bubbles:true}));
 };reader.readAsDataURL(file);
});

mainContent.addEventListener('click',event=>{
 const preset=event.target.closest('[data-brand-color]');
 if(preset){
  const form=document.getElementById('chatbotForm');
  form.elements.primary_color.value=preset.dataset.brandColor;
  form.querySelectorAll('[data-brand-color]').forEach(button=>button.setAttribute('aria-pressed',String(button===preset)));
  form.elements.primary_color.dispatchEvent(new Event('input',{bubbles:true}));
 }
 const add=event.target.closest('.brand-color-add');
 if(add){
  const palette=document.querySelector('.brand-colors .screen-palette');
  palette.hidden=!palette.hidden;add.setAttribute('aria-expanded',String(!palette.hidden));
  if(!palette.hidden)palette.querySelector('input').focus();
 }
});
mainContent.addEventListener('change',event=>{
 if(event.target.name!=='avatar_preset')return;
 const form=document.getElementById('chatbotForm');
 form.elements.avatar_url.value='';
 form.querySelectorAll('.brand-avatar').forEach(label=>{
  label.querySelector('img').src='./assets/avatars/'+label.querySelector('input').value+'.svg';
 });
 form.dispatchEvent(new Event('input',{bubbles:true}));
});

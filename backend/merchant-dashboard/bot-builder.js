/* Bot Builder reference layout with editable, serialized settings. */
const builderRenderBase=renderChatbotSection;
const builderCollectBase=collectChatbotPayload;
collectChatbotPayload=function(form){
 const payload=builderCollectBase(form);
 const current=workspace.chatbot_customization;
 payload.fallback_message=form.elements.fallback_message?.value??current.fallback_message??"I didn't quite catch that. Could you rephrase?";
 payload.retry_suggestions=form.elements.retry_suggestions?.checked??current.retry_suggestions??true;
 payload.support_escalation=form.elements.support_escalation?.checked??current.support_escalation??true;
 return payload;
};
const builderTones=[['Friendly','Warm & approachable',"Hi! Let's find a look you'll love."],['Professional','Polished & forward',"Welcome. I'm here to help you curate your wardrobe selection."],['Playful','Bold, fun & energetic',"Ready for your next favorite outfit? Let's play with style."],['Luxury','Elevated & refined','Discover a considered selection, tailored to your occasion.'],['Minimal','Short & direct','Tell me the occasion. I will find your look.'],['Witty','Clever & memorable',"Great outfits don't happen by accident. Let's build yours."]];
function builderActionMarkup(actions){return actions.map((label,index)=>`<div class="builder-action-chip"><span>${escapeHtml(label)}</span><button type="button" data-builder-remove="${index}" aria-label="Remove ${escapeHtml(label)}">&times;</button></div>`).join('');}
renderChatbotSection=function(){
 const markup=builderRenderBase();if(activeChatbotPage!=='builder')return markup;
 const template=document.createElement('template');template.innerHTML=markup;
 const form=template.content.querySelector('#chatbotForm');if(!form)return markup;
 const s=workspace.chatbot_customization;
 const panel=form.children[1];panel.className='exact-builder';
 const suggestions=['Welcome! What would you like me to help you with today?',"Hi! I'm your personal style assistant. Ready to find your perfect look?",`Welcome to ${s.brand_name||workspace.profile.brand_name||'our store'}. What are we creating today?`];
 panel.innerHTML=`<div hidden>${screenField('Headline','welcome_title',s.welcome_title)}${screenField('Signature','stylist_signature',s.stylist_signature,'textarea')}${screenField('Prompts','suggested_prompts',(s.suggested_prompts||[]).join('\n'),'textarea')}${screenField('Tone','tone_of_voice',s.tone_of_voice,'textarea')}</div>
 <section class="builder-group"><p class="control-group-title">Welcome message</p><label class="builder-description" for="builderWelcome">The first message users see. Make it feel on-brand and inviting.</label><textarea id="builderWelcome" name="welcome_message" rows="2">${escapeHtml(s.welcome_message)}</textarea><button type="button" class="primary-button builder-generate" disabled title="AI welcome-message generation is not connected yet">Generate with AI</button><div class="builder-suggestions"><p class="control-group-title">Suggestions &mdash; click to use</p>${suggestions.map(text=>`<button type="button" data-builder-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div></section>
 <section class="builder-group"><p class="control-group-title">Quick actions</p><p class="builder-description">Primary flows shown when the chat opens. Click &times; to remove any.</p><div class="builder-actions">${builderActionMarkup(s.suggested_prompts||[])}</div><div class="builder-add"><input id="builderNewAction" aria-label="New quick action" placeholder="Add new action" maxlength="120"><button type="button" class="primary-button" data-builder-add>Add</button></div><p class="builder-feedback" aria-live="polite"></p></section>
 <section class="builder-group"><p class="control-group-title">Bot name &amp; personality</p>${screenField('Bot name','assistant_name',s.assistant_name)}<p class="builder-description">Tone</p><div class="builder-tone-grid">${builderTones.map(([name,description])=>`<button type="button" data-builder-tone="${name}" aria-pressed="${s.tone_of_voice===name}"><span>${name}</span><small>${description}</small></button>`).join('')}</div><div class="builder-tone-example" aria-live="polite"><p class="control-group-title">Current tone</p><p>${escapeHtml(s.tone_of_voice)}</p></div></section>
 <section class="builder-group"><p class="control-group-title">Error handling</p><p class="builder-description">How the bot responds when it can't understand a message.</p><label class="builder-fallback"><span class="control-group-title">Fallback message</span><textarea name="fallback_message" rows="2">${escapeHtml(s.fallback_message||"I didn't quite catch that. Could you rephrase?")}</textarea></label>${[['support_escalation','Human support escalation','Offer a handoff to customer care after 2 failed attempts'],['retry_suggestions','Retry suggestions','Show suggested questions the user can try instead']].map(([key,label,hint])=>`<label class="builder-switch-row"><span>${label}<small>${hint}</small></span><input type="checkbox" role="switch" name="${key}" ${s[key]!==false?'checked':''}><span class="builder-switch-track" aria-hidden="true"></span></label>`).join('')}</section>`;
 return template.innerHTML;
};
mainContent.addEventListener('click',event=>{
 const form=document.getElementById('chatbotForm');if(!form)return;
 const suggest=event.target.closest('[data-builder-suggestion]');
 if(suggest){form.elements.welcome_message.value=suggest.dataset.builderSuggestion;form.elements.welcome_message.dispatchEvent(new Event('input',{bubbles:true}));return;}
 const tone=event.target.closest('[data-builder-tone]');
 if(tone){const item=builderTones.find(t=>t[0]===tone.dataset.builderTone);form.elements.tone_of_voice.value=item[0];form.querySelectorAll('[data-builder-tone]').forEach(b=>b.setAttribute('aria-pressed',String(b===tone)));form.querySelector('.builder-tone-example').innerHTML=`<p class="control-group-title">${item[0]}</p><p>${escapeHtml(item[2])}</p>`;form.elements.tone_of_voice.dispatchEvent(new Event('input',{bubbles:true}));return;}
 const remove=event.target.closest('[data-builder-remove]'),add=event.target.closest('[data-builder-add]');
 if(!remove&&!add)return;
 const actions=form.elements.suggested_prompts.value.split('\n').map(v=>v.trim()).filter(Boolean);
 const input=form.querySelector('#builderNewAction'),feedback=form.querySelector('.builder-feedback');
 if(remove)actions.splice(Number(remove.dataset.builderRemove),1);
 if(add){const value=input.value.trim();if(!value){feedback.textContent='Enter an action first.';input.focus();return;}if(actions.some(a=>a.toLowerCase()===value.toLowerCase())){feedback.textContent='This action already exists.';return;}actions.push(value);input.value='';}
 feedback.textContent='';form.elements.suggested_prompts.value=actions.join('\n');form.querySelector('.builder-actions').innerHTML=builderActionMarkup(actions);form.elements.suggested_prompts.dispatchEvent(new Event('input',{bubbles:true}));
});
mainContent.addEventListener('keydown',event=>{if(event.target.id==='builderNewAction'&&event.key==='Enter'){event.preventDefault();mainContent.querySelector('[data-builder-add]').click();}});

function renderChatbotSection() {
  const settings = workspace.chatbot_customization;
  const snapshot = workspace.overview;
  const brandName = settings.brand_name || workspace.profile.brand_name || "StyledGenie";
  const toneOptions = ["Confident","Considered","Playful","Warm","Elevated","Casual","Direct","Encouraging","Understated","Aspirational"];
  const activeTones = Array.isArray(settings.tone_chips) ? settings.tone_chips : [];
  const colorPresets = [
    { label: "Minimal dark", colors: ["#111111","#f5f5f5","#ffffff","#333333","#1D9E75"] },
    { label: "Luxury", colors: ["#1a1a2e","#e8d5b7","#ffffff","#2c2c2c","#c9a84c"] },
    { label: "Natural", colors: ["#2d6a4f","#f0f4f0","#ffffff","#333333","#52b788"] },
    { label: "Bold", colors: ["#c9184a","#fff0f3","#ffffff","#2c2c2c","#ff4d6d"] },
    { label: "Neutral", colors: ["#495057","#f8f9fa","#ffffff","#343a40","#6c757d"] },
  ];
  const featureToggles = [
    { key: "feature_outfit_creation", label: "Full outfit creation", desc: "Builds complete head-to-toe looks from scratch" },
    { key: "feature_complete_look", label: "Complete my look", desc: "Builds around an anchor piece the shopper uploads" },
    { key: "feature_get_inspired", label: "Get inspired", desc: "Translates an inspiration image into shoppable store picks" },
    { key: "feature_customer_care", label: "Customer care", desc: "Handles order tracking, returns, and FAQs" },
  ];
  const privacyToggles = [
    { key: "remember_preferences", label: "Remember shopper preferences", desc: "Stores style profile across sessions for returning shoppers" },
    { key: "show_feedback_buttons", label: "Show feedback buttons", desc: "Love it / Show another - improves recommendations over time" },
    { key: "log_conversations", label: "Log conversations for training", desc: "Anonymised sessions used to improve recommendation quality" },
  ];
  function field(label, name, value, hint) {
    return '<div class="field"><label class="field-label">' + escapeHtml(label) + '</label><input name="' + escapeHtml(name) + '" value="' + escapeHtml(value || '') + '" />' + (hint ? '<span class="field-hint">' + escapeHtml(hint) + '</span>' : '') + '</div>';
  }
  function fieldFull(label, name, value, hint) {
    return '<div class="field field-full"><label class="field-label">' + escapeHtml(label) + '</label><input name="' + escapeHtml(name) + '" value="' + escapeHtml(value || '') + '" />' + (hint ? '<span class="field-hint">' + escapeHtml(hint) + '</span>' : '') + '</div>';
  }
  function textareaFull(label, name, value, rows) {
    return '<div class="field field-full"><label class="field-label">' + escapeHtml(label) + '</label><textarea name="' + escapeHtml(name) + '" rows="' + (rows||3) + '">' + escapeHtml(value || '') + '</textarea></div>';
  }
  function selectField(label, name, options, selected) {
    const opts = options.map(function(o) {
      const val = typeof o === 'object' ? o.value : o;
      const lbl = typeof o === 'object' ? o.label : o;
      return '<option value="' + escapeHtml(val) + '"' + (val === selected ? ' selected' : '') + '>' + escapeHtml(lbl) + '</option>';
    }).join('');
    return '<div class="field"><label class="field-label">' + escapeHtml(label) + '</label><select name="' + escapeHtml(name) + '">' + opts + '</select></div>';
  }
  const previewLogo = settings.logo_url
    ? '<img style="width:28px;height:28px;border-radius:50%;object-fit:cover" src="' + escapeHtml(settings.logo_url) + '" alt="logo" />'
    : '<div style="width:28px;height:28px;border-radius:50%;background:' + escapeHtml(settings.primary_color || '#111') + ';display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:500">' + escapeHtml(getBrandInitials(brandName)) + '</div>';
  const previewHTML = '<div style="background:#f5f5f6;border-radius:12px;padding:12px;border:0.5px solid var(--color-border-tertiary)">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' + previewLogo
    + '<div><div style="font-size:12px;font-weight:500">' + escapeHtml(settings.assistant_name || brandName) + '</div>'
    + '<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:#1D9E75"><span style="width:6px;height:6px;border-radius:50%;background:#1D9E75;display:inline-block"></span> Live stylist</div></div>'
    + '</div>'
    + '<div style="background:white;border-radius:8px;padding:10px;border:0.5px solid var(--color-border-tertiary);margin-bottom:8px">'
    + '<div style="font-size:10px;color:#888;margin-bottom:4px">' + escapeHtml(brandName) + ' Concierge</div>'
    + '<div style="font-size:13px;font-weight:500;margin-bottom:4px">' + escapeHtml(settings.welcome_title || 'A thoughtful look, without the guesswork.') + '</div>'
    + '<div style="font-size:11px;color:#666;line-height:1.5">' + escapeHtml((settings.welcome_message || '').slice(0, 100)) + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">'
    + (settings.suggested_prompts || []).slice(0,3).map(function(p) {
        return '<span style="padding:3px 8px;border-radius:12px;border:0.5px solid #ddd;font-size:10px;background:white">' + escapeHtml(p) + '</span>';
      }).join('')
    + '</div></div>'
    + '<div style="background:white;border-radius:6px;border:0.5px solid var(--color-border-tertiary);padding:6px 10px;display:flex;align-items:center;justify-content:space-between">'
    + '<span style="font-size:10px;color:#aaa">Tell me what you\'re shopping for...</span>'
    + '<div style="width:22px;height:22px;border-radius:50%;background:' + escapeHtml(settings.primary_color || '#111') + '"></div>'
    + '</div></div>';
  const activeChatbotPageLocal = activeChatbotPage || 'settings';
  if (activeChatbotPageLocal === 'analytics') {
    return '<section class="section-stack">' + renderChatbotModuleNav() + renderChatbotAnalyticsPage(snapshot) + '</section>';
  }
  if (activeChatbotPageLocal === 'builder') {
    return '<section class="section-stack">' + renderChatbotModuleNav() + renderBotBuilderPage(snapshot) + '</section>';
  }
  const activeTab = settings._active_tab || 'identity';
  const tabLabels = { identity: 'Brand identity', appearance: 'Appearance', voice: 'Voice & behaviour', features: 'Features & limits' };
  return '<section class="section-stack">'
    + renderChatbotModuleNav()
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:var(--color-background-secondary);border-radius:var(--border-radius-md);margin-bottom:1rem">'
    + '<span style="font-size:12px;color:var(--color-text-secondary)">Changes apply live on the storefront when saved</span>'
    + '<button class="primary-button" form="chatbotForm" type="submit">Save &amp; publish</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 320px;gap:1.25rem;align-items:start">'
    + '<div>'
    + '<div style="display:flex;gap:0;border-bottom:0.5px solid var(--color-border-tertiary);margin-bottom:1.25rem">'
    + Object.keys(tabLabels).map(function(t) {
        const active = activeTab === t;
        return '<button type="button" class="sg-subtab' + (active ? ' active' : '') + '" data-subtab="' + t + '" style="padding:8px 14px;font-size:13px;border:none;background:none;cursor:pointer;color:' + (active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)') + ';font-weight:' + (active ? '500' : '400') + ';border-bottom:2px solid ' + (active ? 'var(--color-text-primary)' : 'transparent') + ';margin-bottom:-0.5px">' + tabLabels[t] + '</button>';
      }).join('')
    + '</div>'
    + '<form id="chatbotForm" class="section-form">'
    + '<div class="sg-subpane" data-subpane="identity" style="' + (activeTab !== 'identity' ? 'display:none' : '') + '">'
    + '<div class="workspace-card"><div class="form-grid">'
    + '<p class="control-group-title" style="grid-column:1/-1">Brand basics</p>'
    + field('Brand name', 'brand_name', brandName)
    + field('Stylist name', 'assistant_name', settings.assistant_name, 'Shown in the chat header')
    + fieldFull('Brand tagline', 'welcome_title', settings.welcome_title)
    + fieldFull('Logo URL', 'logo_url', settings.logo_url, 'PNG or JPG, recommended 80x80px')
    + '<p class="control-group-title" style="grid-column:1/-1">Opening message</p>'
    + textareaFull('Welcome message', 'welcome_message', settings.welcome_message, 3)
    + '<p class="control-group-title" style="grid-column:1/-1">Suggested prompts (max 3)</p>'
    + (settings.suggested_prompts || ['','','']).slice(0,3).map(function(p, i) {
        return '<div class="field' + (i===2 ? ' field-full' : '') + '"><label class="field-label">Prompt ' + (i+1) + '</label><input name="suggested_prompt_' + i + '" value="' + escapeHtml(p) + '" /></div>';
      }).join('')
    + '<p class="control-group-title" style="grid-column:1/-1">Target market</p>'
    + selectField('Primary audience', 'target_audience', ['Womenswear','Menswear','Both','Unisex / Gender-neutral'], settings.target_audience || 'Both')
    + selectField('Region', 'target_market', ['Global','Europe','UK','US','Middle East','Asia Pacific'], settings.target_market || 'Global')
    + '</div></div>'
    + '</div>'
    + '<div class="sg-subpane" data-subpane="appearance" style="' + (activeTab !== 'appearance' ? 'display:none' : '') + '">'
    + '<div class="workspace-card">'
    + '<p class="control-group-title">Colour presets</p>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1rem">'
    + colorPresets.map(function(preset) {
        return '<div class="sg-preset" style="display:flex;gap:6px;padding:4px 10px;border-radius:20px;border:0.5px solid var(--color-border-tertiary);cursor:pointer;align-items:center">'
          + preset.colors.slice(0,2).map(function(c) { return '<span style="width:10px;height:10px;border-radius:50%;background:' + c + ';display:inline-block"></span>'; }).join('')
          + '<span style="font-size:11px;color:var(--color-text-secondary)">' + escapeHtml(preset.label) + '</span>'
          + '<input type="hidden" class="preset-colors" value="' + escapeHtml(JSON.stringify(preset.colors)) + '" />'
          + '</div>';
      }).join('')
    + '</div>'
    + '<p class="control-group-title">Custom colours</p>'
    + '<div class="palette-grid">'
    + [['primary_color','Primary'],['surface_color','Surface'],['bubble_color','Bubble'],['text_color','Text'],['accent_color','Accent']].map(function(pair) {
        return '<label class="palette-control"><input type="color" name="' + pair[0] + '" value="' + escapeHtml(settings[pair[0]] || '#111111') + '" /><strong>' + escapeHtml((settings[pair[0]] || '#111111').toUpperCase()) + '</strong><span>' + pair[1] + '</span></label>';
      }).join('')
    + '</div>'
    + '<p class="control-group-title">Typography</p>'
    + '<div class="form-grid">'
    + selectField('Heading font', 'heading_font', ['Inter','Playfair Display','Garamond','Helvetica Neue','Cormorant','DM Sans'], settings.heading_font)
    + selectField('Body font', 'body_font', ['Inter','DM Sans','Lato','Source Sans Pro','Nunito'], settings.body_font)
    + selectField('Heading style', 'primary_text_style', ['Regular','Medium','Bold','Light'], settings.primary_text_style)
    + selectField('Border radius', 'border_radius_style', ['Rounded (default)','Sharp','Pill'], settings.border_radius_style)
    + '</div>'
    + '<p class="control-group-title">Widget position</p>'
    + '<div class="form-grid">'
    + selectField('Position', 'widget_position', ['Bottom right','Bottom left','Bottom center'], settings.widget_position || 'Bottom right')
    + field('Bottom offset', 'widget_offset_bottom', settings.widget_offset_bottom || '24px')
    + field('Side offset', 'widget_offset_side', settings.widget_offset_side || '24px')
    + selectField('Initial state', 'widget_initial_state', ['Collapsed (bubble)','Open on load','Open after delay'], settings.widget_initial_state || 'Collapsed (bubble)')
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="sg-subpane" data-subpane="voice" style="' + (activeTab !== 'voice' ? 'display:none' : '') + '">'
    + '<div class="workspace-card"><div class="form-grid">'
    + '<p class="control-group-title" style="grid-column:1/-1">Tone of voice</p>'
    + '<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin-bottom:.5rem">'
    + toneOptions.map(function(tone) {
        const active = activeTones.indexOf(tone) > -1;
        return '<span class="sg-tone-chip' + (active ? ' active' : '') + '" data-tone="' + escapeHtml(tone) + '" style="padding:4px 12px;border-radius:20px;border:0.5px solid ' + (active ? 'var(--color-text-primary)' : 'var(--color-border-tertiary)') + ';font-size:12px;cursor:pointer;background:' + (active ? 'var(--color-text-primary)' : 'transparent') + ';color:' + (active ? 'var(--color-background-primary)' : 'var(--color-text-secondary)') + '">' + escapeHtml(tone) + '</span>';
      }).join('')
    + '</div>'
    + '<input type="hidden" name="tone_chips" id="toneChipsInput" value="' + escapeHtml(JSON.stringify(activeTones)) + '" />'
    + textareaFull('Stylist description', 'tone_of_voice', settings.tone_of_voice, 3)
    + textareaFull('Stylist signature', 'stylist_signature', settings.stylist_signature, 2)
    + '<p class="control-group-title" style="grid-column:1/-1">Language &amp; formality</p>'
    + selectField('Formality', 'formality_level', ['Formal','Semi-formal','Casual'], settings.formality_level || 'Semi-formal')
    + selectField('Language', 'language', ['English (UK)','English (US)','German','French','Spanish','Italian'], settings.language || 'English (UK)')
    + fieldFull('Words to avoid', 'words_to_avoid', settings.words_to_avoid, 'Comma separated')
    + fieldFull('Brand vocabulary', 'brand_vocabulary', settings.brand_vocabulary, 'Preferred terms the AI should use')
    + '</div></div>'
    + '</div>'
    + '<div class="sg-subpane" data-subpane="features" style="' + (activeTab !== 'features' ? 'display:none' : '') + '">'
    + '<div class="workspace-card" style="margin-bottom:1rem"><p class="control-group-title">Styling features</p>'
    + featureToggles.map(function(ft) {
        const on = settings[ft.key] !== false;
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:0.5px solid var(--color-border-tertiary)">'
          + '<div><div style="font-size:13px">' + escapeHtml(ft.label) + '</div><div style="font-size:11px;color:var(--color-text-tertiary)">' + escapeHtml(ft.desc) + '</div></div>'
          + '<div class="sg-toggle' + (on ? '' : ' off') + '" data-toggle="' + escapeHtml(ft.key) + '"><input type="hidden" name="' + escapeHtml(ft.key) + '" value="' + (on ? 'true' : 'false') + '" /></div>'
          + '</div>';
      }).join('')
    + '</div>'
    + '<div class="workspace-card" style="margin-bottom:1rem"><div class="form-grid">'
    + '<p class="control-group-title" style="grid-column:1/-1">Conversation limits</p>'
    + selectField('Max products per recommendation', 'max_products_shown', ['3','4','5','6'], String(settings.max_products_shown || '4'))
    + selectField('Max follow-up rounds', 'max_followup_rounds', ['1','2','3','Unlimited'], String(settings.max_followup_rounds || '2'))
    + fieldFull('Offline fallback message', 'offline_message', settings.offline_message || 'Our stylist is offline - check back soon.')
    + fieldFull('No-match fallback message', 'no_match_message', settings.no_match_message || "I couldn't find an exact match - here's what's closest.")
    + '</div></div>'
    + '<div class="workspace-card"><p class="control-group-title">Privacy &amp; data</p>'
    + privacyToggles.map(function(pt) {
        const on = settings[pt.key] !== false;
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:0.5px solid var(--color-border-tertiary)">'
          + '<div><div style="font-size:13px">' + escapeHtml(pt.label) + '</div><div style="font-size:11px;color:var(--color-text-tertiary)">' + escapeHtml(pt.desc) + '</div></div>'
          + '<div class="sg-toggle' + (on ? '' : ' off') + '" data-toggle="' + escapeHtml(pt.key) + '"><input type="hidden" name="' + escapeHtml(pt.key) + '" value="' + (on ? 'true' : 'false') + '" /></div>'
          + '</div>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</form></div>'
    + '<div><div class="workspace-card"><p class="control-group-title" style="margin-top:0">Live preview</p>' + previewHTML + '</div></div>'
    + '</div>'
    + '</section>';
}

function renderChatbotModuleNav() {
  const moduleCards = getChatbotModuleCards(workspace.overview);
  return '<div style="display:flex;gap:8px;margin-bottom:1.25rem">'
    + moduleCards.map(function(card) {
        return '<button type="button" class="sg-module-card' + (card.active ? ' active' : '') + '" data-action="set-chatbot-page" data-page="' + escapeHtml(card.key) + '" style="flex:1;padding:.75rem 1rem;border-radius:var(--border-radius-md);border:0.5px solid ' + (card.active ? 'var(--color-text-primary)' : 'var(--color-border-tertiary)') + ';background:' + (card.active ? 'var(--color-text-primary)' : 'var(--color-background-primary)') + ';color:' + (card.active ? 'var(--color-background-primary)' : 'var(--color-text-primary)') + ';text-align:left;cursor:pointer">'
          + '<div style="font-size:18px;margin-bottom:4px">' + escapeHtml(card.icon) + '</div>'
          + '<div style="font-size:13px;font-weight:500">' + escapeHtml(card.label) + '</div>'
          + '<div style="font-size:11px;opacity:.7">' + escapeHtml(card.meta) + '</div>'
          + '</button>';
      }).join('')
    + '</div>';
}

function wireActiveSection() {
  document.querySelectorAll('.sg-subtab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      const name = tab.dataset.subtab;
      document.querySelectorAll('.sg-subtab').forEach(function(t) {
        const active = t.dataset.subtab === name;
        t.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)';
        t.style.fontWeight = active ? '500' : '400';
        t.style.borderBottomColor = active ? 'var(--color-text-primary)' : 'transparent';
      });
      document.querySelectorAll('.sg-subpane').forEach(function(p) {
        p.style.display = p.dataset.subpane === name ? '' : 'none';
      });
    });
  });
  document.querySelectorAll('.sg-tone-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      chip.classList.toggle('active');
      const isActive = chip.classList.contains('active');
      chip.style.background = isActive ? 'var(--color-text-primary)' : 'transparent';
      chip.style.color = isActive ? 'var(--color-background-primary)' : 'var(--color-text-secondary)';
      chip.style.borderColor = isActive ? 'var(--color-text-primary)' : 'var(--color-border-tertiary)';
      const input = document.getElementById('toneChipsInput');
      if (input) {
        input.value = JSON.stringify(Array.from(document.querySelectorAll('.sg-tone-chip.active')).map(function(c) { return c.dataset.tone; }));
      }
    });
  });
  document.querySelectorAll('.sg-toggle').forEach(function(toggle) {
    toggle.addEventListener('click', function() {
      const isOff = toggle.classList.contains('off');
      toggle.classList.toggle('off', !isOff);
      const input = toggle.querySelector('input[type=hidden]');
      if (input) input.value = isOff ? 'true' : 'false';
    });
  });
  document.querySelectorAll('.sg-preset').forEach(function(preset) {
    preset.addEventListener('click', function() {
      try {
        const colors = JSON.parse(preset.querySelector('.preset-colors').value);
        const keys = ['primary_color','surface_color','bubble_color','text_color','accent_color'];
        const form = document.getElementById('chatbotForm');
        keys.forEach(function(key, i) {
          const input = form ? form.querySelector('[name=' + key + ']') : null;
          if (input && colors[i]) input.value = colors[i];
        });
      } catch(e) {}
    });
  });
}


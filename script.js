(function(){

var CATEGORIES = [
  {id:'CONSTITUCIONAL', label:'Constitucional', icon:'🏛️', color:'#4C6FFF'},
  {id:'PROCESSUAL', label:'Processual', icon:'📋', color:'#8A63D2'},
  {id:'CIVIL', label:'Civil', icon:'🤝', color:'#2FA876'},
  {id:'PENAL', label:'Penal', icon:'⚖️', color:'#D65F5F'},
  {id:'ADMINISTRATIVO', label:'Administrativo', icon:'🏢', color:'#D6913F'},
  {id:'TRIBUTARIO', label:'Tributário', icon:'💰', color:'#3FB6C7'},
  {id:'TRABALHISTA', label:'Trabalhista', icon:'👷', color:'#C77DBB'}
];
var HIGHLIGHTS = [
  {name:'Amarelo', value:'#FDE68A'}, {name:'Verde', value:'#A7E3B0'}, {name:'Azul', value:'#A9D2F5'},
  {name:'Vermelho', value:'#F3AFAF'}, {name:'Laranja', value:'#FBCB92'}
];
var TEXTCOLORS = ['#EDEFF3','#C9A25D','#E0566B','#4C6FFF','#2FA876','#D6913F'];
var CARDCOLORS = CATEGORIES.map(function(c){return c.color;}).concat(['#9AA1AE','#EDEFF3']);

function catInfo(id){ return CATEGORIES.find(function(c){return c.id===id;}) || CATEGORIES[0]; }
function esc(s){ return (s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function stripHtml(html){ var d=document.createElement('div'); d.innerHTML=html||''; return d.textContent||''; }
function uid(){ return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function sanitize(html){
  var d = document.createElement('div'); d.innerHTML = html || '';
  d.querySelectorAll('script,style,iframe,object,embed').forEach(function(n){ n.remove(); });
  d.querySelectorAll('*').forEach(function(n){
    Array.prototype.slice.call(n.attributes).forEach(function(a){ if(/^on/i.test(a.name)) n.removeAttribute(a.name); });
  });
  return d.innerHTML;
}

var state = {
  tab:'feed', laws:[], comments:[], category:'TODAS', search:'', sort:'recentes', status:'todas',
  editingId:null, ready:false
};

var dbApi=null, downloadsApi=null, lawsCol=null, commentsCol=null;

/* ---------------- filtering ---------------- */
function filteredLaws(){
  var list = state.laws.slice();
  if(state.tab === 'favoritos') list = list.filter(function(l){ return l.favorited; });
  if(state.category !== 'TODAS') list = list.filter(function(l){ return l.category === state.category; });
  if(state.status !== 'todas') list = list.filter(function(l){ return (l.status||'vigente') === state.status; });
  if(state.search.trim()){
    var q = state.search.trim().toLowerCase();
    list = list.filter(function(l){
      var hay = (l.title+' '+l.category+' '+(l.tituloText||'')+' '+(l.capituloText||'')+' '+(l.secaoText||'')+' '+stripHtml(l.contentHtml)).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  list.sort(function(a,b){
    if(state.sort==='recentes') return (b.createdAt||0)-(a.createdAt||0);
    if(state.sort==='antigas') return (a.createdAt||0)-(b.createdAt||0);
    if(state.sort==='curtidas') return (b.likes||0)-(a.likes||0);
    return 0;
  });
  return list;
}
function crumbText(l){
  var parts=[]; if(l.tituloText) parts.push(l.tituloText); if(l.capituloText) parts.push(l.capituloText); if(l.secaoText) parts.push(l.secaoText);
  return parts.join(' · ');
}
function commentsFor(lawId){
  return state.comments.filter(function(c){return c.lawId===lawId;}).sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});
}

/* ---------------- chips ---------------- */
var chipDragMoved = false;
function buildChips(){
  var row = document.getElementById('chipRow');
  var html = '<button class="chip'+(state.category==='TODAS'?' active':'')+'" data-cat="TODAS">TODAS</button>';
  CATEGORIES.forEach(function(c){
    html += '<button class="chip'+(state.category===c.id?' active':'')+'" data-cat="'+c.id+'"><span class="dot" style="background:'+c.color+'"></span>'+c.label.toUpperCase()+'</button>';
  });
  row.innerHTML = html;
  row.querySelectorAll('.chip').forEach(function(btn){
    btn.addEventListener('click', function(){
      if(chipDragMoved){ chipDragMoved = false; return; }
      state.category = btn.getAttribute('data-cat'); buildChips(); renderMain();
    });
  });
}
(function enableChipRowDragScroll(){
  var row = document.getElementById('chipRow');
  if(!row) return;
  row.addEventListener('wheel', function(e){
    if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){ row.scrollLeft += e.deltaY; e.preventDefault(); }
  }, {passive:false});
  var isDown = false, startX = 0, startScroll = 0;
  row.addEventListener('mousedown', function(e){
    isDown = true; chipDragMoved = false; row.classList.add('dragging');
    startX = e.pageX; startScroll = row.scrollLeft;
  });
  window.addEventListener('mousemove', function(e){
    if(!isDown) return;
    var delta = e.pageX - startX;
    if(Math.abs(delta) > 5) chipDragMoved = true;
    row.scrollLeft = startScroll - delta;
  });
  window.addEventListener('mouseup', function(){ isDown = false; row.classList.remove('dragging'); });
})();

/* ---------------- feed (one law per screen) ---------------- */
function cardHtml(l, idx, total){
  var cat = catInfo(l.category);
  var color = l.color || cat.color;
  var crumb = crumbText(l);
  var nComments = commentsFor(l.id).length;
  return (
    '<section class="law-card" data-id="'+l.id+'">'+
      '<div class="accentbar" style="background:'+color+'"></div>'+
      '<div class="card-inner">'+
        '<div class="card-eyebrow"><span class="card-tag" style="--tag-color:'+color+'">'+cat.icon+' '+cat.label+'</span>'+
          '<span class="card-status '+((l.status==='revogada')?'revogada':'')+'">'+((l.status==='revogada')?'Revogada':'Vigente')+'</span></div>'+
        (crumb ? '<div class="card-crumb">'+esc(crumb)+'</div>' : '')+
        '<h3 class="card-title">'+esc(l.title)+'</h3>'+
        '<div class="card-content-wrap"><div class="card-content law-richtext" data-lawid="'+l.id+'">'+ (l.contentHtml||'<p><em>Sem conteúdo.</em></p>') +'</div></div>'+
        '<button class="readmore" data-open="'+l.id+'">Ler artigo completo ▸</button>'+
        '<div class="card-actions">'+
          '<button class="iconbtn '+(l.liked?'active-like':'')+'" data-like="'+l.id+'"><span class="ic">'+(l.liked?'❤️':'🤍')+'</span> '+(l.likes||0)+'</button>'+
          '<button class="iconbtn" data-open="'+l.id+'" data-focus="comments"><span class="ic">💬</span> '+nComments+'</button>'+
          '<button class="iconbtn '+(l.favorited?'active-fav':'')+'" data-fav="'+l.id+'"><span class="ic">'+(l.favorited?'⭐':'☆')+'</span></button>'+
          '<div class="spacer"></div>'+
          '<button class="colorpickbtn" style="background:'+color+'" data-colorpick="'+l.id+'" title="Alterar cor"></button>'+
          '<button class="smallicon" data-edit="'+l.id+'" title="Editar">✏️</button>'+
          '<button class="smallicon" data-del="'+l.id+'" title="Excluir">🗑️</button>'+
        '</div>'+
      '</div>'+
      (idx < total-1 ? '<div class="scrollhint">▾ próxima lei</div>' : '')+
    '</section>'
  );
}

var io=null;
function setupObserver(container){
  if(io) io.disconnect();
  io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in-view'); } else { en.target.classList.remove('in-view'); } });
  }, {root:container, threshold:0.55});
  container.querySelectorAll('.law-card').forEach(function(card){ io.observe(card); });
}

function renderFeed(){
  var list = filteredLaws();
  document.getElementById('resultCount').textContent = list.length + (list.length===1?' lei':' leis');
  var main = document.getElementById('mainArea');
  var prevContainer = document.getElementById('feedScroll');
  var scrollBefore = prevContainer ? prevContainer.scrollTop : 0;
  if(!state.ready){ main.innerHTML = '<div class="empty"><div class="big">⏳</div><p>Carregando legislação...</p></div>'; return; }
  if(!list.length){
    var firstRun = !state.laws.length;
    main.innerHTML = firstRun
      ? '<div class="empty"><div class="big">⚖️</div><p>Ainda não há nenhuma lei cadastrada.<br>Toque em <b>Editor</b>, no topo, para adicionar a primeira.</p></div>'
      : '<div class="empty"><div class="big">📭</div><p>Nenhuma lei encontrada para esse filtro ou pesquisa.</p></div>';
    return;
  }
  main.innerHTML = '<div class="feed" id="feedScroll">'+ list.map(function(l,i){return cardHtml(l,i,list.length);}).join('') +'</div>';
  var container = document.getElementById('feedScroll');
  if(container) container.scrollTop = scrollBefore;
  setupObserver(container);
  bindCardEvents();
  bindGlossaryTooltips(container);
}

function bindCardEvents(){
  document.querySelectorAll('[data-open]').forEach(function(b){
    b.addEventListener('click', function(){ openLawModal(b.getAttribute('data-open'), b.getAttribute('data-focus')==='comments'); });
  });
  document.querySelectorAll('[data-like]').forEach(function(b){ b.addEventListener('click', function(){ toggleLike(b.getAttribute('data-like')); }); });
  document.querySelectorAll('[data-fav]').forEach(function(b){ b.addEventListener('click', function(){ toggleFav(b.getAttribute('data-fav')); }); });
  document.querySelectorAll('[data-edit]').forEach(function(b){ b.addEventListener('click', function(){ openEditor(b.getAttribute('data-edit')); }); });
  document.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click', function(){ deleteLaw(b.getAttribute('data-del')); }); });
  document.querySelectorAll('[data-colorpick]').forEach(function(b){ b.addEventListener('click', function(e){ openColorPop(e, b.getAttribute('data-colorpick')); }); });
}

/* glossary tooltip (read-only contexts) */
function bindGlossaryTooltips(root){
  root.querySelectorAll('.glossario').forEach(function(span){
    span.addEventListener('click', function(e){
      e.stopPropagation();
      showNotePop(e, span.getAttribute('data-def')||'');
    });
  });
}
function showNotePop(e, text){
  closeNotePop();
  var pop = document.createElement('div');
  pop.className = 'notepop'; pop.id = 'activeNotePop';
  pop.innerHTML = '<b>Significado</b>' + esc(text);
  document.body.appendChild(pop);
  var rect = e.target.getBoundingClientRect();
  var top = rect.bottom + 8; var left = Math.min(Math.max(8, rect.left), window.innerWidth-248);
  pop.style.top = top+'px'; pop.style.left = left+'px';
  setTimeout(function(){ document.addEventListener('click', outsideNotePop); },0);
}
function outsideNotePop(e){ var p=document.getElementById('activeNotePop'); if(p && !p.contains(e.target)) closeNotePop(); }
function closeNotePop(){ var p=document.getElementById('activeNotePop'); if(p) p.remove(); document.removeEventListener('click', outsideNotePop); }

/* ---------------- floating selection toolbar (grifar / cor / nota, sem precisar editar) ---------------- */
var selPopEl = null;
var currentSelRange = null, currentSelLawId = null, currentSelContainer = null;

function ensureSelPop(){
  if(selPopEl) return selPopEl;
  selPopEl = document.createElement('div');
  selPopEl.className = 'selpop';
  selPopEl.id = 'selPop';
  selPopEl.style.display = 'none';
  document.body.appendChild(selPopEl);
  return selPopEl;
}
function buildSelPopContent(){
  var hi = HIGHLIGHTS.map(function(h){ return '<button class="selpop-sw" style="background:'+h.value+'" data-selhi="'+h.value+'" title="'+h.name+'"></button>'; }).join('');
  var tc = TEXTCOLORS.map(function(c){ return '<button class="selpop-sw textcolor" style="background:'+c+'" data-selcolor="'+c+'" title="Cor do texto"></button>'; }).join('');
  return (
    '<div class="selpop-row"><span class="selpop-label">Grifar</span>'+hi+'<button class="selpop-x" data-selhi="__remove__" title="Remover grifo">×</button></div>'+
    '<div class="selpop-row"><span class="selpop-label">Cor do texto</span>'+tc+'<button class="selpop-x" data-selcolor="__reset__" title="Cor padrão">×</button></div>'+
    '<button class="selpop-note" data-selnote="1">💡 Adicionar nota</button>'
  );
}
function hideSelPop(){ if(selPopEl) selPopEl.style.display = 'none'; }
function positionSelPop(rect){
  var pop = selPopEl;
  pop.style.display = 'flex';
  var w = pop.offsetWidth || 220, h = pop.offsetHeight || 96;
  var left = rect.left + rect.width/2 - w/2;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  // prioriza aparecer ABAIXO do trecho selecionado, pra atrapalhar menos o menu nativo
  // de copiar/colar do celular (que normalmente aparece ACIMA da seleção).
  var top = rect.bottom + 12;
  if(top + h > window.innerHeight - 8) top = rect.top - h - 12;
  if(top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}
var selPopInteracting = false;
function markSelPopInteracting(){
  selPopInteracting = true;
  clearTimeout(window.__selPopInteractTimer);
  window.__selPopInteractTimer = setTimeout(function(){ selPopInteracting = false; }, 800);
}
function handleSelectionChange(){
  if(selPopInteracting) return; // não fecha a barrinha enquanto o dedo ainda está interagindo com ela
  var sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.isCollapsed){ hideSelPop(); return; } // só aparece com seleção de verdade
  var range = sel.getRangeAt(0);
  var node = range.commonAncestorContainer;
  var el = node.nodeType===3 ? node.parentElement : node;
  var container = el ? el.closest('.law-richtext[data-lawid]') : null;
  if(!container){ hideSelPop(); return; }
  var rect = range.getBoundingClientRect();
  if(rect.width===0 && rect.height===0){ hideSelPop(); return; }
  currentSelRange = range.cloneRange();
  currentSelLawId = container.getAttribute('data-lawid');
  currentSelContainer = container;
  ensureSelPop();
  selPopEl.innerHTML = buildSelPopContent();
  bindSelPopEvents();
  positionSelPop(rect);
}
document.addEventListener('selectionchange', function(){
  clearTimeout(window.__selpopTimer);
  // espera a seleção "assentar" antes de reagir — no celular, arrastar as alças de
  // seleção dispara vários eventos seguidos, e reagir rápido demais fecha a barrinha no meio do toque.
  window.__selpopTimer = setTimeout(handleSelectionChange, 320);
});
document.addEventListener('mousedown', function(e){
  if(selPopEl && selPopEl.style.display!=='none' && !selPopEl.contains(e.target) && !e.target.closest('.law-richtext')) hideSelPop();
});

function bindSelPopEvents(){
  Array.prototype.forEach.call(selPopEl.querySelectorAll('button'), function(btn){
    btn.addEventListener('touchstart', markSelPopInteracting, {passive:true});
    btn.addEventListener('mousedown', markSelPopInteracting);
  });
  selPopEl.querySelectorAll('[data-selhi]').forEach(function(b){
    b.addEventListener('click', function(){
      var color = b.getAttribute('data-selhi');
      if(!currentSelRange || !currentSelContainer) return;
      if(color==='__remove__'){
        var removed = removeWrap(currentSelRange, 'mark');
        if(!removed){ alert('Toque dentro de um trecho já grifado para remover o grifo.'); return; }
      } else {
        if(currentSelRange.collapsed){ alert('Selecione um trecho de texto (arraste sobre ele) para grifar.'); return; }
        applyWrap(currentSelRange, 'mark', {style:'background:'+color+';'});
      }
      finishSelAction();
    });
  });
  selPopEl.querySelectorAll('[data-selcolor]').forEach(function(b){
    b.addEventListener('click', function(){
      var color = b.getAttribute('data-selcolor');
      if(!currentSelRange || !currentSelContainer) return;
      if(color==='__reset__'){
        var removed = removeWrap(currentSelRange, 'span', 'data-usercolor');
        if(!removed){ alert('Toque dentro de um trecho com cor aplicada para restaurar a cor padrão.'); return; }
      } else {
        if(currentSelRange.collapsed){ alert('Selecione um trecho de texto para mudar a cor.'); return; }
        applyWrap(currentSelRange, 'span', {style:'color:'+color+';', 'data-usercolor':'1'});
      }
      finishSelAction();
    });
  });
  var noteBtn = selPopEl.querySelector('[data-selnote]');
  if(noteBtn){
    noteBtn.addEventListener('click', function(){
      if(!currentSelRange || !currentSelContainer) return;
      var savedRange = currentSelRange.cloneRange();
      var lawId = currentSelLawId, container = currentSelContainer;
      hideSelPop();
      var def = prompt('Digite o significado ou nota para o trecho selecionado:');
      if(def){ wrapRangeWithNote(savedRange, def, container); persistRichText(lawId, container.innerHTML); }
      var s = window.getSelection(); if(s) s.removeAllRanges();
    });
  }
}
function finishSelAction(){
  if(currentSelContainer && currentSelLawId) persistRichText(currentSelLawId, currentSelContainer.innerHTML);
  hideSelPop();
  var s = window.getSelection(); if(s) s.removeAllRanges();
}
function applyWrap(range, tagName, attrs){
  var el = document.createElement(tagName);
  Object.keys(attrs||{}).forEach(function(k){ el.setAttribute(k, attrs[k]); });
  try{ range.surroundContents(el); }
  catch(err){
    try{ var content = range.extractContents(); el.appendChild(content); range.insertNode(el); }catch(e2){}
  }
}
function removeWrap(range, tagName, requiredAttr){
  var selector = tagName + (requiredAttr ? '['+requiredAttr+']' : '');
  var candidates = [range.startContainer, range.endContainer, range.commonAncestorContainer];
  for(var i=0;i<candidates.length;i++){
    var n = candidates[i];
    if(!n) continue;
    var el = n.nodeType===3 ? n.parentElement : n;
    var target = el ? el.closest(selector) : null;
    if(target){
      var parent = target.parentNode;
      while(target.firstChild) parent.insertBefore(target.firstChild, target);
      parent.removeChild(target);
      return true;
    }
  }
  return false;
}
function persistRichText(lawId, newHtml){
  if(!lawsCol) return;
  var clean = sanitize(newHtml);
  var law = state.laws.find(function(l){ return l.id===lawId; });
  if(law) law.contentHtml = clean;
  lawsCol.doc(lawId).update({contentHtml:clean, updatedAt:Date.now()}).catch(function(){});
}

function openColorPop(e, id){
  closeColorPop();
  var pop = document.createElement('div'); pop.className='colorpop'; pop.id='activeColorPop';
  var law = state.laws.find(function(l){return l.id===id;});
  var current = law ? (law.color || catInfo(law.category).color) : '';
  pop.innerHTML = CARDCOLORS.map(function(c){ return '<button class="sw '+(c.toLowerCase()===String(current).toLowerCase()?'chosen':'')+'" style="background:'+c+'" data-setcolor="'+c+'"></button>'; }).join('');
  document.body.appendChild(pop);
  var rect = e.target.getBoundingClientRect();
  pop.style.top = (rect.bottom + 6) + 'px';
  pop.style.left = Math.max(8, rect.left - 90) + 'px';
  pop.querySelectorAll('[data-setcolor]').forEach(function(sw){
    sw.addEventListener('click', function(ev){ ev.stopPropagation(); setLawColor(id, sw.getAttribute('data-setcolor')); closeColorPop(); });
  });
  setTimeout(function(){ document.addEventListener('click', outsideColorPop); },0);
}
function outsideColorPop(e){ var pop=document.getElementById('activeColorPop'); if(pop && !pop.contains(e.target)) closeColorPop(); }
function closeColorPop(){ var pop=document.getElementById('activeColorPop'); if(pop) pop.remove(); document.removeEventListener('click', outsideColorPop); }

/* ---------------- modal: full article + comments ---------------- */
function openLawModal(id, focusComments){
  var l = state.laws.find(function(x){return x.id===id;});
  if(!l) return;
  var app = document.getElementById('app');
  var overlay = document.createElement('div');
  overlay.className='modal-overlay'; overlay.id='lawModal';
  var cat = catInfo(l.category); var color = l.color || cat.color;
  var crumb = crumbText(l);
  var cmts = commentsFor(l.id);
  overlay.innerHTML =
    '<div class="modal-sheet">'+
      '<div class="modal-handle"><span></span></div>'+
      '<button class="smallicon modal-close" id="modalCloseBtn">✕</button>'+
      '<div class="modal-body">'+
        '<span class="card-tag" style="--tag-color:'+color+'">'+cat.icon+' '+cat.label+'</span>'+
        (crumb ? '<div class="card-crumb" style="margin-top:6px;">'+esc(crumb)+'</div>' : '')+
        '<h3 class="card-title">'+esc(l.title)+'</h3>'+
        '<div class="card-content-full law-richtext" data-lawid="'+l.id+'">'+ (l.contentHtml||'') +'</div>'+
      '</div>'+
      '<div class="comments" id="modalComments">'+
        '<div class="comments-title">Comentários</div>'+
        '<div id="commentlist-'+l.id+'">'+
          (cmts.length ? cmts.map(function(c){
            return '<div class="commentitem"><div><div class="commenttext">'+esc(c.text)+'</div><div class="commentmeta">'+(c.dateLabel||'')+'</div></div><button class="commentdel" data-delcomment="'+c.id+'">excluir</button></div>';
          }).join('') : '<div class="commentmeta" style="padding:6px 0;">Nenhum comentário ainda.</div>')+
        '</div>'+
        '<div class="commentform"><input type="text" placeholder="Escreva seu comentário..." id="modalCommentInput"><button id="modalCommentSend">ENVIAR</button></div>'+
      '</div>'+
    '</div>';
  app.appendChild(overlay);
  bindGlossaryTooltips(overlay);
  requestAnimationFrame(function(){ overlay.classList.add('open'); });

  document.getElementById('modalCloseBtn').addEventListener('click', closeLawModal);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeLawModal(); });
  document.getElementById('modalCommentSend').addEventListener('click', function(){
    var inp = document.getElementById('modalCommentInput');
    if(inp.value.trim()){ addComment(l.id, inp.value.trim()); inp.value=''; refreshModalComments(l.id); }
  });
  document.getElementById('modalCommentInput').addEventListener('keydown', function(e){
    if(e.key==='Enter' && e.target.value.trim()){ addComment(l.id, e.target.value.trim()); e.target.value=''; refreshModalComments(l.id); }
  });
  overlay.querySelectorAll('[data-delcomment]').forEach(function(b){
    b.addEventListener('click', function(){ deleteComment(b.getAttribute('data-delcomment')); setTimeout(function(){refreshModalComments(l.id);},60); });
  });
  if(focusComments){
    setTimeout(function(){ document.getElementById('modalComments').scrollIntoView({behavior:'smooth', block:'start'}); document.getElementById('modalCommentInput').focus(); }, 350);
  }
}
function refreshModalComments(lawId){
  var listEl = document.getElementById('commentlist-'+lawId);
  if(!listEl) return;
  var cmts = commentsFor(lawId);
  listEl.innerHTML = cmts.length ? cmts.map(function(c){
    return '<div class="commentitem"><div><div class="commenttext">'+esc(c.text)+'</div><div class="commentmeta">'+(c.dateLabel||'')+'</div></div><button class="commentdel" data-delcomment="'+c.id+'">excluir</button></div>';
  }).join('') : '<div class="commentmeta" style="padding:6px 0;">Nenhum comentário ainda.</div>';
  listEl.querySelectorAll('[data-delcomment]').forEach(function(b){
    b.addEventListener('click', function(){ deleteComment(b.getAttribute('data-delcomment')); setTimeout(function(){refreshModalComments(lawId);},60); });
  });
  renderFeed();
}
function closeLawModal(){
  var overlay = document.getElementById('lawModal');
  if(!overlay) return;
  overlay.classList.remove('open');
  setTimeout(function(){ overlay.remove(); }, 250);
}

/* ---------------- DB actions ---------------- */
function saveLawField(id, patch){ if(lawsCol) lawsCol.doc(id).update(patch).catch(function(){}); }
function toggleLike(id){ var l=state.laws.find(function(x){return x.id===id;}); if(!l) return; var liked=!l.liked; var likes=(l.likes||0)+(liked?1:-1); if(likes<0)likes=0; saveLawField(id,{liked:liked, likes:likes}); }
function toggleFav(id){ var l=state.laws.find(function(x){return x.id===id;}); if(!l) return; saveLawField(id,{favorited:!l.favorited}); }
function setLawColor(id,color){ saveLawField(id,{color:color}); }
function deleteLaw(id){ if(!confirm('Excluir esta lei permanentemente?')) return; if(lawsCol) lawsCol.doc(id).delete().catch(function(){}); }
function addComment(lawId, text){
  if(!commentsCol) return;
  var id = uid(); var now = Date.now(); var d = new Date(now);
  var label = String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  commentsCol.doc(id).set({lawId:lawId, text:text, createdAt:now, dateLabel:label}).catch(function(){});
}
function deleteComment(id){ if(commentsCol) commentsCol.doc(id).delete().catch(function(){}); }

/* ---------------- word-note wrapping (editor) ---------------- */
function getSelectedRangeIn(editable){
  var sel = window.getSelection();
  if(!sel || sel.rangeCount===0) return null;
  var range = sel.getRangeAt(0);
  if(!editable.contains(range.commonAncestorContainer)) return null;
  if(range.collapsed) return null;
  return range.cloneRange();
}
function wrapRangeWithNote(range, defText, editable){
  if(!range) return;
  var span = document.createElement('span');
  span.className = 'glossario';
  span.setAttribute('data-def', defText);
  try{
    range.surroundContents(span);
  }catch(err){
    try{
      var content = range.extractContents();
      span.appendChild(content);
      range.insertNode(span);
    }catch(err2){ return; }
  }
  var sel = window.getSelection();
  if(sel) sel.removeAllRanges();
}

/* ---------------- Editor ---------------- */
var editorState = { color: CARDCOLORS[0] };

function toolbarHtml(){
  var hi = HIGHLIGHTS.map(function(h){ return '<button class="tb-sw" style="background:'+h.value+'" data-hilite="'+h.value+'" title="'+h.name+'"></button>'; }).join('');
  var tc = TEXTCOLORS.map(function(c){ return '<button class="tb-sw" style="background:'+c+'" data-forecolor="'+c+'" title="Cor do texto"></button>'; }).join('');
  return (
    '<div class="toolbar">'+
      '<button type="button" class="toolbtn" data-cmd="bold" title="Negrito">B</button>'+
      '<button type="button" class="toolbtn italic" data-cmd="italic" title="Itálico">I</button>'+
      '<button type="button" class="toolbtn underline" data-cmd="underline" title="Sublinhado">U</button>'+
      '<div class="tb-sep"></div>'+
      '<button type="button" class="toolbtn" data-block="H2" title="Título">T1</button>'+
      '<button type="button" class="toolbtn" data-block="H3" title="Subtítulo">T2</button>'+
      '<button type="button" class="toolbtn" data-block="P" title="Parágrafo normal">¶</button>'+
      '<div class="tb-sep"></div>'+
      '<button type="button" class="toolbtn" data-cmd="insertUnorderedList" title="Lista">• Lista</button>'+
      '<button type="button" class="toolbtn" data-cmd="insertOrderedList" title="Lista numerada">1. Lista</button>'+
      '<div class="tb-sep"></div>'+
      '<button type="button" class="toolbtn" data-insert="art" title="Inserir Artigo">Art.</button>'+
      '<button type="button" class="toolbtn" data-insert="par" title="Inserir Parágrafo">§</button>'+
      '<button type="button" class="toolbtn" data-insert="inc" title="Inserir Inciso">I—</button>'+
      '<button type="button" class="toolbtn" data-insert="ali" title="Inserir Alínea">a)</button>'+
      '<div class="tb-sep"></div>'+
      '<button type="button" class="toolbtn" data-note title="Adicionar nota/significado a um trecho selecionado">💡 Nota</button>'+
      '<div class="tb-sep"></div>'+
      '<span class="tb-swatches" title="Marca-texto">🖍 '+hi+'<button class="tb-sw" style="background:transparent;border:1px dashed var(--text-faint);" data-hilite="transparent" title="Remover marca-texto">×</button></span>'+
      '<div class="tb-sep"></div>'+
      '<span class="tb-swatches" title="Cor do texto">🎨 '+tc+'</span>'+
    '</div>'
  );
}

function editorHtml(law){
  var isEdit = !!law;
  editorState.color = (law && law.color) || CATEGORIES[0].color;
  return (
    '<div class="editorscroll"><div class="editor">'+
      '<h2>'+(isEdit ? 'Editar lei' : 'Nova lei')+'</h2>'+
      '<div class="sub">Preencha os campos e formate o texto como preferir.</div>'+
      '<div class="row2">'+
        '<div class="field"><label>Classificação</label><select id="f_category">'+
          CATEGORIES.map(function(c){ return '<option value="'+c.id+'" '+((law&&law.category===c.id)?'selected':'')+'>'+c.icon+' '+c.label+'</option>'; }).join('')+
        '</select></div>'+
        '<div class="field"><label>Status</label><select id="f_status">'+
          '<option value="vigente" '+((!law||law.status!=='revogada')?'selected':'')+'>Vigente</option>'+
          '<option value="revogada" '+((law&&law.status==='revogada')?'selected':'')+'>Revogada</option>'+
        '</select></div>'+
      '</div>'+
      '<div class="field"><label>Título da lei (ex.: Código Penal — Art. 121)</label><input type="text" id="f_title" value="'+esc(law?law.title:'')+'" placeholder="Ex.: Código Penal — Art. 121"></div>'+
      '<div class="row3">'+
        '<div class="field"><label>Título (estrutura)</label><input type="text" id="f_titulo" value="'+esc(law?law.tituloText:'')+'" placeholder="Ex.: Título I"></div>'+
        '<div class="field"><label>Capítulo</label><input type="text" id="f_capitulo" value="'+esc(law?law.capituloText:'')+'" placeholder="Ex.: Capítulo I"></div>'+
        '<div class="field"><label>Seção</label><input type="text" id="f_secao" value="'+esc(law?law.secaoText:'')+'" placeholder="Ex.: Seção II"></div>'+
      '</div>'+
      '<div class="field"><label>Cor do card</label><div class="colorswatchrow" id="colorSwatchRow">'+
          CARDCOLORS.map(function(c){ return '<button type="button" class="sw '+(c.toLowerCase()===editorState.color.toLowerCase()?'chosen':'')+'" style="background:'+c+'" data-colorchoice="'+c+'"></button>'; }).join('')+
      '</div></div>'+
      '<div class="field"><label>Texto da lei</label>'+
        toolbarHtml()+
        '<div class="editable" id="f_content" contenteditable="true">'+ (law ? (law.contentHtml||'') : '<p class="lei-caput">Art. XXX. </p>') +'</div>'+
        '<div class="editorhint">Dica: selecione uma palavra e clique em "💡 Nota" para adicionar o significado dela. No feed, quem ler pode tocar na palavra para ver a explicação.</div>'+
      '</div>'+
      '<div class="editorbtns">'+
        '<button class="btn primary" id="saveLawBtn">'+(isEdit?'Salvar alterações':'Adicionar lei')+'</button>'+
        (isEdit ? '<button class="btn danger" id="deleteLawBtn">Excluir</button>' : '')+
        '<button class="btn" id="cancelEditBtn">Cancelar</button>'+
      '</div>'+
    '</div></div>'
  );
}

function renderEditor(){
  var law = state.editingId ? state.laws.find(function(l){return l.id===state.editingId;}) : null;
  document.getElementById('mainArea').innerHTML = editorHtml(law);
  bindEditorEvents(law);
}

function bindEditorEvents(law){
  var editable = document.getElementById('f_content');
  editable.focus();

  document.querySelectorAll('.toolbtn[data-cmd]').forEach(function(b){
    b.addEventListener('click', function(){ editable.focus(); document.execCommand(b.getAttribute('data-cmd'), false, null); });
  });
  document.querySelectorAll('.toolbtn[data-block]').forEach(function(b){
    b.addEventListener('click', function(){ editable.focus(); document.execCommand('formatBlock', false, b.getAttribute('data-block')); });
  });
  document.querySelectorAll('[data-hilite]').forEach(function(b){
    b.addEventListener('click', function(){
      editable.focus(); var color = b.getAttribute('data-hilite');
      try{ document.execCommand('hiliteColor', false, color); }catch(e){ document.execCommand('backColor', false, color); }
    });
  });
  document.querySelectorAll('[data-forecolor]').forEach(function(b){
    b.addEventListener('click', function(){ editable.focus(); document.execCommand('foreColor', false, b.getAttribute('data-forecolor')); });
  });
  document.querySelectorAll('[data-insert]').forEach(function(b){
    b.addEventListener('click', function(){
      editable.focus(); var kind = b.getAttribute('data-insert'); var snippet='';
      if(kind==='art') snippet = '<p class="lei-caput">Art. º. </p>';
      if(kind==='par') snippet = '<p class="lei-paragrafo">§ º </p>';
      if(kind==='inc') snippet = '<p class="lei-inciso">I - </p>';
      if(kind==='ali') snippet = '<p class="lei-alinea">a) </p>';
      document.execCommand('insertHTML', false, snippet);
    });
  });
  document.querySelectorAll('.toolbar button').forEach(function(btn){
    btn.addEventListener('mousedown', function(e){ e.preventDefault(); });
  });
  document.querySelector('[data-note]').addEventListener('click', function(){
    var savedRange = getSelectedRangeIn(editable);
    if(!savedRange){ alert('Selecione uma palavra ou trecho do texto primeiro (arraste o dedo ou o mouse sobre o trecho) e depois toque em "💡 Nota".'); return; }
    var def = prompt('Digite o significado ou nota para o trecho selecionado:');
    if(def){ editable.focus(); wrapRangeWithNote(savedRange, def, editable); }
  });
  document.querySelectorAll('#colorSwatchRow [data-colorchoice]').forEach(function(sw){
    sw.addEventListener('click', function(){
      editorState.color = sw.getAttribute('data-colorchoice');
      document.querySelectorAll('#colorSwatchRow .sw').forEach(function(s){ s.classList.remove('chosen'); });
      sw.classList.add('chosen');
    });
  });
  editable.addEventListener('click', function(e){
    var g = e.target.closest('.glossario');
    if(g && e.altKey){
      var novo = prompt('Editar nota (deixe em branco para remover):', g.getAttribute('data-def')||'');
      if(novo===null) return;
      if(novo.trim()===''){
        var parent = g.parentNode; while(g.firstChild) parent.insertBefore(g.firstChild, g); parent.removeChild(g);
      } else { g.setAttribute('data-def', novo); }
    }
  });

  document.getElementById('saveLawBtn').addEventListener('click', function(){
    var title = document.getElementById('f_title').value.trim();
    if(!title){ alert('Dê um título para a lei.'); return; }
    var payload = {
      category: document.getElementById('f_category').value,
      status: document.getElementById('f_status').value,
      title: title,
      tituloText: document.getElementById('f_titulo').value.trim(),
      capituloText: document.getElementById('f_capitulo').value.trim(),
      secaoText: document.getElementById('f_secao').value.trim(),
      color: editorState.color,
      contentHtml: sanitize(document.getElementById('f_content').innerHTML)
    };
    if(law){
      payload.updatedAt = Date.now();
      lawsCol.doc(law.id).update(payload).catch(function(){});
    } else {
      var id = uid(); payload.id = id; payload.createdAt = Date.now(); payload.updatedAt = Date.now();
      payload.likes = 0; payload.liked = false; payload.favorited = false;
      lawsCol.doc(id).set(payload).catch(function(){});
    }
    state.editingId = null; goTab('feed');
  });
  if(law){
    document.getElementById('deleteLawBtn').addEventListener('click', function(){ deleteLaw(law.id); state.editingId=null; goTab('feed'); });
  }
  document.getElementById('cancelEditBtn').addEventListener('click', function(){ state.editingId=null; goTab('feed'); });
}

function openEditor(id){ state.editingId = id; goTab('editor'); }

/* ---------------- tabs / routing ---------------- */
function goTab(tab){
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab')===tab); });
  var showFilters = tab !== 'editor';
  document.getElementById('chipRow').style.display = showFilters ? 'flex' : 'none';
  document.getElementById('filterRow').style.display = showFilters ? 'flex' : 'none';
  document.querySelector('.searchwrap').style.display = showFilters ? 'block':'none';
  renderMain();
}
function renderMain(){ if(state.tab === 'editor') renderEditor(); else renderFeed(); }

document.querySelectorAll('.tab').forEach(function(t){
  t.addEventListener('click', function(){ if(t.getAttribute('data-tab')==='editor') state.editingId=null; goTab(t.getAttribute('data-tab')); });
});
document.getElementById('searchInput').addEventListener('input', function(e){ state.search = e.target.value; renderFeed(); });
document.getElementById('sortSelect').addEventListener('change', function(e){ state.sort = e.target.value; renderFeed(); });
document.getElementById('statusSelect').addEventListener('change', function(e){ state.status = e.target.value; renderFeed(); });
document.getElementById('themeToggle').addEventListener('click', function(){
  var root = document.documentElement; var current = root.getAttribute('data-theme');
  if(current === 'light'){ root.setAttribute('data-theme','dark'); }
  else if(current === 'dark'){ root.removeAttribute('data-theme'); }
  else { root.setAttribute('data-theme','light'); }
});

/* ---------------- menu: export / import CSV (Google Sheets) ---------------- */
document.getElementById('menuToggle').addEventListener('click', function(e){
  e.stopPropagation();
  var existing = document.getElementById('activeMenuPop');
  if(existing){ existing.remove(); return; }
  var pop = document.createElement('div'); pop.className='menupop'; pop.id='activeMenuPop';
  var connected = state.sheetsConnected;
  pop.innerHTML =
    '<div class="hint" id="sheetsStatusHint">'+(connected ? '🟢 Conectado ao Google Sheets' : '⚪ Usando armazenamento local deste navegador')+'</div>'+
    (connected
      ? '<button id="sheetsDisconnectBtn">🔌 Desconectar do Google Sheets</button>'
      : '<button id="sheetsConnectBtn">🔗 Conectar ao Google Sheets</button>')+
    '<button id="exportCsvBtn">📤 Exportar tudo para .csv</button>'+
    '<button id="importCsvBtn">📥 Importar de .csv</button>';
  document.querySelector('.headerbtns').appendChild(pop);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  document.getElementById('importCsvBtn').addEventListener('click', function(){ document.getElementById('csvFileInput').click(); });
  var connBtn = document.getElementById('sheetsConnectBtn');
  if(connBtn){
    connBtn.addEventListener('click', function(){
      var url = prompt('Cole aqui a URL do seu Google Apps Script Web App (termina em /exec):\n\nSiga o guia "Conectar ao Google Sheets" que veio junto com estes arquivos.', getSheetsUrl());
      if(url && url.trim()){
        setSheetsUrl(url.trim());
        location.reload();
      }
    });
  }
  var disBtn = document.getElementById('sheetsDisconnectBtn');
  if(disBtn){
    disBtn.addEventListener('click', function(){
      if(confirm('Desconectar do Google Sheets? O app volta a salvar apenas neste navegador (localStorage).')){
        setSheetsUrl('');
        location.reload();
      }
    });
  }
  setTimeout(function(){ document.addEventListener('click', outsideMenuPop); },0);
});
function outsideMenuPop(e){ var p=document.getElementById('activeMenuPop'); if(p && !p.contains(e.target) && e.target.id!=='menuToggle') closeMenuPop(); }
function closeMenuPop(){ var p=document.getElementById('activeMenuPop'); if(p) p.remove(); document.removeEventListener('click', outsideMenuPop); }

function toCSVField(v){ v=(v===undefined||v===null)?'':String(v); if(/[",\n]/.test(v)){ v='"'+v.replace(/"/g,'""')+'"'; } return v; }
function lawsToCSV(laws){
  var headers = ['id','category','status','title','titulo','capitulo','secao','color','likes','favorited','liked','conteudo_texto','conteudo_html'];
  var rows = [headers.join(',')];
  laws.forEach(function(l){
    var row = [l.id,l.category,l.status||'vigente',l.title,l.tituloText||'',l.capituloText||'',l.secaoText||'',l.color||'',l.likes||0,l.favorited?'sim':'nao',l.liked?'sim':'nao', stripHtml(l.contentHtml), l.contentHtml||''];
    rows.push(row.map(toCSVField).join(','));
  });
  return rows.join('\r\n');
}
async function exportCSV(){
  closeMenuPop();
  var csv = lawsToCSV(state.laws);
  if(downloadsApi){
    try{ await downloadsApi.save({filename:'legislacao.csv', data:csv}); return; }catch(e){}
  }
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download='legislacao.csv'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function parseCSV(text){
  var rows=[], row=[], field='', inQuotes=false;
  for(var i=0;i<text.length;i++){
    var c = text[i];
    if(inQuotes){
      if(c === '"'){ if(text[i+1] === '"'){ field+='"'; i++; } else { inQuotes=false; } } else field += c;
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\r'){ }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}
function importCSVText(text){
  var rows = parseCSV(text).filter(function(r){ return r.length>1; });
  if(!rows.length) return 0;
  var headers = rows[0].map(function(h){return h.trim().toLowerCase();});
  var count=0;
  for(var i=1;i<rows.length;i++){
    var r = rows[i]; var obj={};
    headers.forEach(function(h,idx){ obj[h] = r[idx]!==undefined?r[idx]:''; });
    var id = obj.id && obj.id.trim() ? obj.id.trim() : uid();
    var payload = {
      id:id,
      category: (obj.category||'CIVIL').toUpperCase(),
      status: obj.status || 'vigente',
      title: obj.title || 'Sem título',
      tituloText: obj.titulo || '',
      capituloText: obj.capitulo || '',
      secaoText: obj.secao || '',
      color: obj.color || '',
      likes: parseInt(obj.likes||'0',10) || 0,
      favorited: (obj.favorited||'').toLowerCase()==='sim',
      liked: (obj.liked||'').toLowerCase()==='sim',
      contentHtml: sanitize(obj.conteudo_html && obj.conteudo_html.trim() ? obj.conteudo_html : ('<p>'+esc(obj.conteudo_texto||'')+'</p>')),
      createdAt: Date.now(), updatedAt: Date.now()
    };
    lawsCol.doc(id).set(payload).catch(function(){});
    count++;
  }
  return count;
}
document.getElementById('csvFileInput').addEventListener('change', function(e){
  closeMenuPop();
  var file = e.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    var n = importCSVText(String(reader.result||''));
    alert(n + ' lei(s) importada(s) com sucesso.');
  };
  reader.readAsText(file);
  e.target.value = '';
});

buildChips();

/* ---------------- seed data ---------------- */
var SEED_LAWS = [
  { category:'PENAL', status:'vigente', title:'Código Penal — Art. 121',
    tituloText:'Título I', capituloText:'Capítulo I — Dos Crimes Contra a Vida', secaoText:'', color:'#D65F5F',
    contentHtml:'<p class="lei-caput">Art. 121. <span class="glossario" data-def="No sentido jurídico, significa tirar a vida de outra pessoa, de forma intencional ou não.">Matar</span> alguém:</p>'+
      '<p class="lei-paragrafo">Pena — <span class="glossario" data-def="Pena privativa de liberdade cumprida em regime fechado, semiaberto ou aberto.">reclusão</span>, de seis a vinte anos.</p>'+
      '<p class="lei-paragrafo">§ 1º Se o agente comete o crime impelido por motivo de relevante valor social ou moral, ou sob o domínio de violenta emoção, logo em seguida a injusta provocação da vítima, o juiz pode reduzir a pena de um sexto a um terço.</p>'+
      '<p class="lei-paragrafo">§ 2º Homicídio <span class="glossario" data-def="Quando a lei prevê circunstâncias que tornam o crime mais grave, aumentando a pena.">qualificado</span> — se o homicídio é cometido:</p>'+
      '<p class="lei-inciso">I - mediante paga ou promessa de recompensa, ou por outro motivo torpe;</p>'+
      '<p class="lei-inciso">II - por motivo fútil;</p>'+
      '<p class="lei-inciso">III - com emprego de veneno, fogo, explosivo, asfixia, tortura ou outro meio insidioso ou cruel;</p>' },
  { category:'CONSTITUCIONAL', status:'vigente', title:'Constituição Federal — Art. 5º',
    tituloText:'Título II', capituloText:'Capítulo I — Dos Direitos e Deveres Individuais e Coletivos', secaoText:'', color:'#4C6FFF',
    contentHtml:'<p class="lei-caput">Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a <span class="glossario" data-def="Que não pode ser violado; protegido contra qualquer forma de ataque ou desrespeito.">inviolabilidade</span> do direito à vida, à liberdade, à igualdade, à segurança e à propriedade, nos termos seguintes:</p>'+
      '<p class="lei-inciso">I - homens e mulheres são iguais em direitos e obrigações, nos termos desta Constituição;</p>'+
      '<p class="lei-inciso">II - ninguém será obrigado a fazer ou deixar de fazer alguma coisa senão em virtude de lei;</p>'+
      '<p class="lei-inciso">III - ninguém será submetido a tortura nem a tratamento desumano ou degradante;</p>' },
  { category:'CIVIL', status:'vigente', title:'Código Civil — Art. 186',
    tituloText:'Livro I', capituloText:'Título III — Dos Atos Ilícitos', secaoText:'', color:'#2FA876',
    contentHtml:'<p class="lei-caput">Art. 186. Aquele que, por ação ou omissão voluntária, negligência ou imprudência, violar direito e causar dano a outrem, ainda que exclusivamente <span class="glossario" data-def="Dano que atinge sentimentos, honra ou dignidade, sem necessariamente causar prejuízo financeiro.">moral</span>, comete <span class="glossario" data-def="Ação contrária à lei que gera o dever de indenizar.">ato ilícito</span>.</p>' },
  { category:'TRABALHISTA', status:'vigente', title:'CLT — Art. 7º',
    tituloText:'', capituloText:'Da Duração do Trabalho', secaoText:'', color:'#C77DBB',
    contentHtml:'<p class="lei-caput">Art. 7º A duração normal do trabalho, para os empregados em qualquer atividade privada, não excederá de 8 (oito) horas diárias, desde que não seja fixado expressamente outro limite.</p>'+
      '<p class="lei-paragrafo">Parágrafo único. As disposições deste artigo não se aplicam aos empregados que exerçam funções incompatíveis com a fixação de horário de trabalho.</p>' },
  { category:'PROCESSUAL', status:'vigente', title:'Código de Processo Civil — Art. 139',
    tituloText:'Livro II', capituloText:'Dos Poderes, dos Deveres e da Responsabilidade do Juiz', secaoText:'', color:'#8A63D2',
    contentHtml:'<p class="lei-caput">Art. 139. O juiz dirigirá o processo conforme as disposições deste Código, incumbindo-lhe:</p>'+
      '<p class="lei-inciso">I - assegurar às partes igualdade de tratamento;</p>'+
      '<p class="lei-inciso">II - velar pela duração razoável do processo;</p>' }
];

function seedIfEmpty(){
  if(!lawsCol) return;
  lawsCol.get().then(function(res){
    var docs = (res && res.docs) || [];
    if(docs.length) return;
    SEED_LAWS.forEach(function(law){
      var id = uid();
      lawsCol.doc(id).set(Object.assign({}, law, { id:id, likes: Math.floor(Math.random()*40), liked:false, favorited:false,
        createdAt: Date.now() - Math.floor(Math.random()*9)*86400000, updatedAt: Date.now() })).catch(function(){});
    });
  }).catch(function(){});
}
function normalizeDocs(docs){
  return docs.map(function(d){ var data = d.data ? d.data() : d; var id = d.id || data.id; return Object.assign({id:id}, data); });
}

/* ---------------- Google Sheets "collection" (via Apps Script Web App) ---------------- */
function createSheetsCollection(sheetName, baseUrl){
  var listeners = [];
  var cache = {};
  function snapshot(){
    return { docs: Object.keys(cache).map(function(id){ return { id:id, data:function(){ return cache[id]; } }; }) };
  }
  function notify(){ var snap = snapshot(); listeners.forEach(function(cb){ cb(snap); }); }
  function apiCall(action, payload){
    return fetch(baseUrl, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(Object.assign({action:action, sheet:sheetName}, payload||{}))
    }).then(function(r){ return r.json(); });
  }
  function refresh(){
    return apiCall('list', {}).then(function(res){
      if(res && res.error){ setSheetsStatus('erro'); return; }
      cache = {};
      (res && res.items || []).forEach(function(item){ if(item && item.id) cache[item.id] = item; });
      setSheetsStatus('ok');
      notify();
    }).catch(function(){ setSheetsStatus('erro'); });
  }
  refresh();
  var pollTimer = setInterval(refresh, 6000);
  return {
    doc: function(id){
      return {
        set: function(data){
          var full = Object.assign({}, data, {id:id});
          cache[id] = full; notify();
          return apiCall('save', {item:full}).catch(function(){ setSheetsStatus('erro'); });
        },
        update: function(patch){
          var full = Object.assign({}, cache[id]||{id:id}, patch);
          cache[id] = full; notify();
          return apiCall('save', {item:full}).catch(function(){ setSheetsStatus('erro'); });
        },
        delete: function(){
          delete cache[id]; notify();
          return apiCall('delete', {id:id}).catch(function(){ setSheetsStatus('erro'); });
        }
      };
    },
    get: function(){
      return apiCall('list', {}).then(function(res){
        var items = (res && res.items) || [];
        return { docs: items.map(function(item){ return { id:item.id, data:function(){ return item; } }; }) };
      }).catch(function(){ return { docs: Object.values(cache).map(function(item){ return {id:item.id, data:function(){return item;}}; }) }; });
    },
    onSnapshot: function(cb){ listeners.push(cb); cb(snapshot()); },
    stop: function(){ clearInterval(pollTimer); }
  };
}

function setSheetsStatus(s){
  state.sheetsStatus = s;
  var el = document.getElementById('sheetsStatusHint');
  if(el){
    el.textContent = s==='ok' ? '🟢 Sincronizado com o Google Sheets' : (s==='erro' ? '🔴 Erro ao falar com o Google Sheets — verifique a URL' : '');
  }
}

function getSheetsUrl(){
  try{ return localStorage.getItem('sheetsWebAppUrl') || ''; }catch(e){ return ''; }
}
function setSheetsUrl(url){
  try{
    if(url){ localStorage.setItem('sheetsWebAppUrl', url); }
    else{ localStorage.removeItem('sheetsWebAppUrl'); }
  }catch(e){}
}

/* ---------------- local storage "collection" (works offline, no server needed) ---------------- */
function createLocalCollection(storageKey){
  var listeners = [];
  function readAll(){
    try{ return JSON.parse(localStorage.getItem(storageKey) || '{}'); }catch(e){ return {}; }
  }
  function writeAll(all){
    try{ localStorage.setItem(storageKey, JSON.stringify(all)); }catch(e){}
    var snap = toSnapshot(all);
    listeners.forEach(function(cb){ cb(snap); });
  }
  function toSnapshot(all){
    return { docs: Object.keys(all).map(function(id){ return { id:id, data:function(){ return all[id]; } }; }) };
  }
  return {
    doc: function(id){
      return {
        set: function(data){ return new Promise(function(resolve){ var all=readAll(); all[id]=Object.assign({}, data, {id:id}); writeAll(all); resolve(); }); },
        update: function(patch){ return new Promise(function(resolve){ var all=readAll(); all[id]=Object.assign({}, all[id]||{}, patch); writeAll(all); resolve(); }); },
        delete: function(){ return new Promise(function(resolve){ var all=readAll(); delete all[id]; writeAll(all); resolve(); }); }
      };
    },
    get: function(){ return Promise.resolve(toSnapshot(readAll())); },
    onSnapshot: function(onNext){ listeners.push(onNext); onNext(toSnapshot(readAll())); }
  };
}

function init(){
  downloadsApi = null; // fora do Claude, o download usa o link comum (já implementado como fallback)
  var sheetsUrl = getSheetsUrl();
  if(sheetsUrl){
    lawsCol = createSheetsCollection('leis', sheetsUrl);
    commentsCol = createSheetsCollection('comentarios', sheetsUrl);
    state.sheetsConnected = true;
  } else {
    lawsCol = createLocalCollection('legislacao_laws_v1');
    commentsCol = createLocalCollection('legislacao_comments_v1');
    state.sheetsConnected = false;
  }

  lawsCol.onSnapshot(function(snap){
    var docs = (snap && snap.docs) || snap || [];
    var newLaws = normalizeDocs(docs);
    var newHash = JSON.stringify(newLaws);
    state.ready = true;
    if(newHash === state.lastLawsHash) return; // nada mudou: não redesenha (evita piscar)
    state.lastLawsHash = newHash;
    state.laws = newLaws;
    if(state.tab !== 'editor') renderMain();
  });

  commentsCol.onSnapshot(function(snap){
    var docs = (snap && snap.docs) || snap || [];
    var newComments = normalizeDocs(docs);
    var newHash = JSON.stringify(newComments);
    if(newHash === state.lastCommentsHash) return; // nada mudou: não redesenha
    state.lastCommentsHash = newHash;
    state.comments = newComments;
    if((state.tab==='feed' || state.tab==='favoritos') && state.tab !== 'editor') renderFeed();
  });

  renderMain();
}
init();

})();

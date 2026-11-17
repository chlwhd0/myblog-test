import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithPopup,GoogleAuthProvider,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,collectionGroup,query,where,orderBy,limit,getDocs,getDoc,setDoc,doc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* 웹 앱 설정값은 공개되어도 안전합니다. 접근 제한은 Firestore 보안 규칙이 담당합니다. */
export const app=initializeApp({
  apiKey:"AIzaSyCA1UEqW171x6lhrRSUZWcZlMutrBL5_Qk",
  authDomain:"myblog-test-54f1c.firebaseapp.com",
  projectId:"myblog-test-54f1c",
  appId:"1:949641109591:web:8272f81622a6bcbd514312"
});
export const auth=getAuth(app);
export const db=getFirestore(app);
export const $=id=>document.getElementById(id);

export async function login(){
  try{await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){
    if(e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request")return;
    alert("로그인하지 못했습니다. 팝업 차단을 풀고 다시 시도하세요.");
  }
}
export const logout=()=>signOut(auth);

/* 비공개 글 목록을 읽을 수 있으면 블로그 주인입니다. 규칙이 서버에서 판단합니다. */
async function checkOwner(user){
  if(!user)return false;
  try{await getDocs(query(collection(db,"posts"),where("visibility","==","private"),limit(1)));return true}
  catch(e){return false}
}

export function fmtDate(ts){
  const d=ts&&ts.toDate?ts.toDate():null;
  if(!d)return "";
  return d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0");
}

export function el(tag,props,...kids){
  const e=document.createElement(tag);
  Object.entries(props||{}).forEach(([k,v])=>{
    if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v);
  });
  kids.flat().forEach(k=>{if(k!=null)e.appendChild(typeof k==="string"?document.createTextNode(k):k)});
  return e;
}

function renderHeader(active,user,owner){
  const h=$("hdr");h.textContent="";
  h.appendChild(el("a",{class:"brand",href:"/"},el("i"),"PM 작업실"));
  const nav=el("nav",{class:"hnav","aria-label":"주 메뉴"});
  const link=(href,text,key)=>{const a=el("a",{href,text});if(active===key)a.setAttribute("aria-current","page");return a};
  nav.appendChild(link("/projects","프로젝트","projects"));
  if(owner)nav.appendChild(link("/notes","내 노트","notes"));
  if(user){
    const bell=el("div",{class:"bellwrap"});
    nav.appendChild(bell);
    setupBell(bell,user);
    nav.appendChild(el("span",{class:"who",text:user.displayName||"로그인됨"}));
    nav.appendChild(el("button",{type:"button",text:"로그아웃",onclick:logout}));
  }else{
    nav.appendChild(el("button",{type:"button",class:"login",text:"구글 로그인",onclick:login}));
  }
  h.appendChild(nav);
}

/* 로그인 상태가 바뀔 때마다 머리글을 다시 그리고 화면 그리기 함수를 부릅니다. */
export function boot(active,render){
  onAuthStateChanged(auth,async user=>{
    const owner=await checkOwner(user);
    renderHeader(active,user,owner);
    render({user,owner});
  });
}

/* 공개 글은 모두, 비공개 글은 주인만 불러와 최신순으로 합칩니다. */
export async function loadPosts(owner){
  const posts=collection(db,"posts");
  const reads=[getDocs(query(posts,where("visibility","==","public")))];
  if(owner)reads.push(getDocs(query(posts,where("visibility","==","private"))));
  const snaps=await Promise.all(reads);
  const list=snaps.flatMap(s=>s.docs.map(d=>({id:d.id,...d.data()})));
  list.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  return list;
}

/* ---- 알림: 나를 부르거나, 내 댓글에 답하거나, 내 글에 댓글이 달리면 종 모양에 표시됩니다. ---- */
const KIND_TEXT={mention:"님이 회원님을 호출했어요",reply:"님이 내 댓글에 답글을 남겼어요",comment:"님이 내 글에 댓글을 남겼어요"};

async function setupBell(wrap,user){
  const btn=el("button",{type:"button",class:"bell","aria-label":"알림","aria-expanded":"false","aria-haspopup":"true"});
  btn.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const dot=el("span",{class:"bdot"});dot.hidden=true;btn.appendChild(dot);
  const panel=el("div",{class:"npanel",role:"menu"});panel.hidden=true;
  wrap.appendChild(btn);wrap.appendChild(panel);

  let items=[],seen=0,titles=new Map(),failed=false;
  const unread=()=>items.filter(c=>(c.createdAt?.seconds||0)>seen).length;
  function drawDot(){const n=unread();dot.hidden=n===0;dot.textContent=n>9?"9+":String(n)}

  function drawPanel(){
    panel.textContent="";
    if(failed){panel.appendChild(el("p",{class:"nempty",text:"알림을 불러오지 못했습니다."}));return}
    if(!items.length){panel.appendChild(el("p",{class:"nempty",text:"새 알림이 없습니다."}));return}
    items.forEach(c=>{
      const kind=(c.kinds&&c.kinds[user.uid])||"comment";
      const isNew=(c.createdAt?.seconds||0)>seen;
      const snippet=(c.text||"").length>60?c.text.slice(0,60)+"…":(c.text||"");
      panel.appendChild(el("a",{class:"nitem"+(isNew?" new":""),href:"/post?id="+encodeURIComponent(c.postId)+"#c-"+c.id,role:"menuitem"},
        el("b",{text:(c.name||"익명")}),el("span",{text:KIND_TEXT[kind]||KIND_TEXT.comment}),
        el("em",{text:"“"+snippet+"”"}),
        el("small",{text:(titles.get(c.postId)||"프로젝트 글")+" · "+fmtDate(c.createdAt)})));
    });
  }

  try{
    const snap=await getDocs(query(collectionGroup(db,"comments"),where("notify","array-contains",user.uid),orderBy("createdAt","desc"),limit(20)));
    items=snap.docs.map(d=>({id:d.id,postId:d.ref.parent.parent.id,...d.data()}));
    try{const u=await getDoc(doc(db,"users",user.uid));seen=u.exists()?(u.data().notifSeenAt?.seconds||0):0}catch(e){}
    await Promise.all([...new Set(items.map(c=>c.postId))].map(async pid=>{
      try{const p=await getDoc(doc(db,"posts",pid));if(p.exists())titles.set(pid,p.data().title||"프로젝트 글")}catch(e){}
    }));
  }catch(e){failed=true}
  drawDot();

  function close(){panel.hidden=true;btn.setAttribute("aria-expanded","false")}
  btn.addEventListener("click",async ev=>{
    ev.stopPropagation();
    if(!panel.hidden){close();return}
    drawPanel();panel.hidden=false;btn.setAttribute("aria-expanded","true");
    // 열어서 본 것으로 치고, 이번에만 새 알림 표시는 그대로 둡니다.
    if(!failed&&unread()>0){
      dot.hidden=true;
      try{await setDoc(doc(db,"users",user.uid),{notifSeenAt:serverTimestamp()});}catch(e){}
    }
  });
  document.addEventListener("click",ev=>{if(!wrap.contains(ev.target))close()});
  document.addEventListener("keydown",ev=>{if(ev.key==="Escape")close()});
}

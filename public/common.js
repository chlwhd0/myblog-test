import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithPopup,GoogleAuthProvider,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,query,where,limit,getDocs} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

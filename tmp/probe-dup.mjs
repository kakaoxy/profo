import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("frontend/.env.local","utf8").split("\n").map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const API = env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const login = await (await fetch(`${API}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:env.E2E_ADMIN_USER,password:env.E2E_ADMIN_PASSWORD})})).json();
const token = login.access_token;
const r = await fetch(`${API}/api/v1/admin/merchant/stores/check-duplicates`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({store_name:"【审计】望江店999999",address:"上海市浦东新区陆家嘴望江店1号",lng:121.5057,lat:31.2397,contact_phone:"13900002222",company_id:null})});
console.log("check-duplicates:", r.status, JSON.stringify(await r.json(), null, 2).slice(0,1500));
const list = await (await fetch(`${API}/api/v1/admin/merchant/stores?page=1&page_size=5`,{headers:{Authorization:`Bearer ${token}`}})).json();
console.log("store list total:", list.total, JSON.stringify(list.items?.slice(0,3).map(i=>({id:i.id,name:i.store_name,phone:i.contact_phone_masked,addr:i.address})), null, 2));

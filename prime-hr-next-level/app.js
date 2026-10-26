/* PRIME HR NEXT LEVEL • Cloud-first HR frontend
   Public source code contains NO private HR records or secret database keys.
   RLS policies in schema.sql enforce authorization on the database server. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = {client:null,user:null,profile:null,view:"dashboard",branches:[],employees:[],attendance:[],leaves:[],candidates:[],profiles:[],signup:false,loading:false};
  const nameOf = e => e ? e.full_name : "Unknown employee";
  const esc = input => String(input ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const dateText = s => s ? new Date(s + (String(s).length===10?"T12:00:00":"")).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Colombo"}) : "—";
  const timeText = s => s ? new Date(s).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Colombo"}) : "—";
  const localDate = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const isHR = () => !!state.profile && state.profile.is_active && ["admin","hr"].includes(state.profile.role);
  const isAdmin = () => !!state.profile && state.profile.is_active && state.profile.role === "admin";
  const mine = () => state.employees.find(e=>e.auth_user_id===state.user?.id && e.status==="active");
  const branchName = id => state.branches.find(b=>b.id===id)?.name || "Unassigned";
  const employeeName = id => nameOf(state.employees.find(e=>e.id===id));
  const empty = (col,text) => '<tr><td colspan="'+col+'" class="empty">'+esc(text)+'</td></tr>';
  let toastTimer;

  function toast(msg, err=false) {
    const t=$("toast"); t.textContent=String(msg); t.className="show"+(err?" error":"");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className="",4500);
  }
  function screen(id) {
    ["loader","setup-screen","auth-screen","pending-screen","workspace"].forEach(x=>$(x).classList.toggle("hidden",x!==id));
  }
  function fmtStatus(value) {
    const s=String(value||"unknown").toLowerCase();
    return '<span class="pill '+esc(s)+'">'+esc(value)+'</span>';
  }
  function normalizeErr(error) {
    const text=String(error?.message||error||"Request failed");
    return text.length>180?text.slice(0,180)+"…":text;
  }
  function toggleAuth() {
    state.signup=!state.signup;
    $("auth-title").textContent=state.signup?"Request employee access":"Welcome back";
    $("name-wrap").classList.toggle("hidden",!state.signup);
    $("auth-name").required=state.signup;
    $("auth-submit").textContent=state.signup?"Request account":"Sign in";
    $("toggle-auth").textContent=state.signup?"Already registered? Sign in":"New employee? Request an account";
  }
  async function submitAuth(event) {
    event.preventDefault();
    const email=$("auth-email").value.trim().toLowerCase();
    const password=$("auth-password").value;
    const b=$("auth-submit"); b.disabled=true;
    try{
      if (state.signup) {
        const full_name=$("auth-name").value.trim();
        if (!full_name) throw Error("Please enter your full name.");
        const {error}=await state.client.auth.signUp({email,password,options:{data:{full_name}}});
        if(error) throw error;
        toast("Registration received. Check your email for confirmation and wait for administrator approval.");
        state.signup=false; toggleAuth(); // revert to login
        $("auth-form").reset();
      } else {
        const {error}=await state.client.auth.signInWithPassword({email,password});
        if(error) throw error;
        await loadSession();
      }
    }catch(err){toast(normalizeErr(err),true)}finally{b.disabled=false}
  }
  async function loadSession() {
    try{
      const {data:{session},error}=await state.client.auth.getSession();
      if(error) throw error;
      if(!session){state.user=null;state.profile=null;screen("auth-screen");return}
      state.user=session.user;
      const {data:profile,error:perr}=await state.client.from("profiles").select("id,email,full_name,role,is_active").eq("id",state.user.id).maybeSingle();
      if(perr) throw perr;
      if(!profile) {screen("pending-screen");$("pending-user").textContent="No employee profile found. Contact the administrator.";return}
      state.profile=profile;
      if(!profile.is_active){$("pending-user").textContent=profile.email||state.user.email;screen("pending-screen");return}
      $("user-name").textContent=profile.full_name||profile.email;
      $("user-role").textContent=profile.role.toUpperCase();
      $("side-role").textContent="Role: "+profile.role.toUpperCase();
      $("user-initial").textContent=(profile.full_name||profile.email||"P")[0].toUpperCase();
      document.querySelectorAll(".hr-only").forEach(el=>el.classList.toggle("hidden",!isHR()));
      document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
      screen("workspace");
      await fetchData();
    }catch(err){console.error("Session error",err);toast("Account loading failed. Check your database setup and permissions.",true);screen("auth-screen")}
  }
  async function fetchData() {
    if(state.loading)return;
    state.loading=true;
    try {
      const all=[
        state.client.from("branches").select("id,name").order("name"),
        state.client.from("employees").select("id,staff_code,full_name,email,designation,department,branch_id,joined_on,status,auth_user_id").order("full_name").limit(1000),
        state.client.from("attendance").select("id,employee_id,work_date,check_in,check_out,mode").order("check_in",{ascending:false}).limit(500),
        state.client.from("leave_requests").select("id,employee_id,kind,from_date,to_date,reason,status").order("created_at",{ascending:false}).limit(500)
      ];
      if(isHR()) all.push(state.client.from("candidates").select("id,full_name,email,position,branch_id,stage,notes").order("created_at",{ascending:false}).limit(500));
      if(isHR()) all.push(state.client.from("profiles").select("id,email,full_name,role,is_active").order("email").limit(1000));
      const result=await Promise.all(all);
      for(const r of result)if(r.error)throw r.error;
      [state.branches,state.employees,state.attendance,state.leaves]=result.slice(0,4).map(r=>r.data||[]);
      state.candidates=isHR()?result[4].data||[]:[];
      state.profiles=isHR()?result[5].data||[]:[];
      renderAll();
    } catch(err){console.error("Data access error",err);toast("Unable to load HR data: "+normalizeErr(err),true)}
    finally{state.loading=false}
  }
  function renderAll() {
    $("today-label").textContent=new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Colombo"});
    const today=localDate();
    $("m-employees").textContent=state.employees.filter(e=>e.status==="active").length;
    $("m-present").textContent=state.attendance.filter(a=>a.work_date===today&&!!a.check_in).length;
    $("m-leave").textContent=state.leaves.filter(l=>l.status==="pending").length;
    $("m-hiring").textContent=isHR()?state.candidates.filter(c=>!["Rejected","Hired"].includes(c.stage)).length:"—";
    $("welcome-summary").textContent=isHR()?"HR access active. Company-wide records are available for your authorised role.":"Employee access active. Your personal records and leave requests are available.";
    $("branch-list").innerHTML=state.branches.length?state.branches.map(b=>'<div><b>'+esc(b.name)+'</b><span>'+state.employees.filter(e=>e.branch_id===b.id).length+' employees</span></div>').join(""):"No branches set up";
    renderEmployees();renderAttendance();renderLeave();renderCandidates();renderAccounts();
  }
  function switchView(view) {
    if(["employees","recruitment"].includes(view)&&!isHR())return toast("HR access required.",true);
    if(view==="accounts"&&!isAdmin())return toast("Administrator access required.",true);
    if(!$( "view-"+view))return;
    state.view=view;
    document.querySelectorAll(".view").forEach(el=>el.classList.toggle("hidden",el.id!=="view-"+view));
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    const titles={dashboard:["MANAGEMENT CENTRE","Workforce overview","Live, permission-controlled people operations."],employees:["PEOPLE OPERATIONS","Employee directory","Manage the master record of PRIME team members."],attendance:["TIME & ATTENDANCE","Attendance tracker","Check in, check out and review times."],leave:["WORKFORCE PLANNING","Leave management","Apply, monitor and approve leave requests."],recruitment:["TALENT ACQUISITION","Recruitment pipeline","Manage applicants and interview stages."],accounts:["ACCESS & SECURITY","User approvals","Review pending signups and assign secure access."],roadmap:["PRODUCT DEVELOPMENT","Upcoming modules","Planned functionality—not live yet."]};
    const t=titles[view];
    $("page-eyebrow").textContent=t[0];$("page-title").textContent=t[1];$("page-subtitle").textContent=t[2];$("crumb-label").textContent=t[1];
    document.querySelector(".sidebar").classList.remove("open");
  }
  function renderEmployees() {
    const q=$("employee-search").value.toLowerCase();
    const rows=state.employees.filter(e=>!q||[e.full_name,e.staff_code,e.designation,branchName(e.branch_id)].join(" ").toLowerCase().includes(q));
    $("employee-rows").innerHTML=rows.map(e=>'<tr><td><b>'+esc(e.staff_code)+'</b></td><td>'+esc(e.full_name)+'<div class="muted">'+esc(e.email||"")+'</div></td><td>'+esc(e.designation)+'</td><td>'+esc(branchName(e.branch_id))+'</td><td>'+fmtStatus(e.status)+'</td><td><button class="btn tiny outline" data-edit-employee="'+esc(e.id)+'">Edit</button></td></tr>').join("")||empty(6,"No employee records found");
  }
  function formValue(form,name){return form.elements.namedItem(name)?.value||""}
  function setFormValue(form,name,value){const e=form.elements.namedItem(name);if(e)e.value=value??""}
  function fillBranchOptions() {
    ["employee-branch","candidate-branch"].forEach(id=>{
      $(id).innerHTML='<option value="">Select location</option>'+state.branches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join("");
    });
  }
  function editEmployee(id) {
    if(!isHR())return;
    fillBranchOptions();
    const e=state.employees.find(x=>x.id===id);
    const f=$("employee-form");f.reset();
    ["id","staff_code","full_name","email","designation","department","branch_id","joined_on","status"].forEach(k=>setFormValue(f,k,e?.[k]||(k==="status"?"active":"")));
    $("employee-modal-title").textContent=e?"Edit employee":"New employee";
    $("employee-dialog").showModal();
  }
  async function saveEmployee(event) {
    event.preventDefault();if(!isHR())return;
    const f=event.target,id=formValue(f,"id");
    const email=formValue(f,"email").trim().toLowerCase();
    const linked=state.profiles.find(p=>p.email?.toLowerCase()===email);
    const previous=state.employees.find(x=>x.id===id);
    const record={staff_code:formValue(f,"staff_code").trim(),full_name:formValue(f,"full_name").trim(),email:email||null,designation:formValue(f,"designation").trim(),department:formValue(f,"department").trim()||null,branch_id:formValue(f,"branch_id"),joined_on:formValue(f,"joined_on")||null,status:formValue(f,"status"),auth_user_id:linked?.id||previous?.auth_user_id||null};
    if(linked&&linked.id!==previous?.auth_user_id)toast("Registered account matched by email and linked to employee.");
    const q=id?state.client.from("employees").update(record).eq("id",id):state.client.from("employees").insert(record);
    const {error}=await q;
    if(error)return toast(normalizeErr(error),true);
    $("employee-dialog").close();toast("Employee record saved.");await fetchData();
  }
  function exportCSV() {
    if(!isHR())return;
    const fields=["staff_code","full_name","email","designation","department","branch","joined_on","status"];
    const safe=value=>{
      let s=String(value??"");
      if(/^[\t\r=+\-@]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const rows=[fields,...state.employees.map(e=>[e.staff_code,e.full_name,e.email,e.designation,e.department,branchName(e.branch_id),e.joined_on,e.status])];
    const csv="\ufeff"+rows.map(r=>r.map(safe).join(",")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="prime-employee-directory-"+localDate()+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  }
  function renderAttendance() {
    const today=localDate(),self=mine(),record=state.attendance.find(a=>a.employee_id===self?.id&&a.work_date===today);
    const txt=!self?"An employee profile has not been linked to this login. HR must link your email to a staff record.":record?"Checked in at "+timeText(record.check_in)+(record.check_out?" · Out "+timeText(record.check_out):" · Currently checked in"):"No check-in recorded today.";
    $("attendance-info").textContent=txt;
    $("attendance-state").textContent=!self?"NOT LINKED":record?(record.check_out?"COMPLETED":"CHECKED IN"):"NOT CHECKED IN";
    $("checkin").disabled=!self||!!record;
    $("checkout").disabled=!self||!record||!!record.check_out;
    const rows=state.attendance.filter(a=>isHR()||a.employee_id===self?.id);
    $("attendance-rows").innerHTML=rows.map(a=>'<tr><td>'+esc(employeeName(a.employee_id))+'</td><td>'+esc(dateText(a.work_date))+'</td><td>'+esc(timeText(a.check_in))+'</td><td>'+esc(timeText(a.check_out))+'</td><td>'+esc(a.mode)+'</td></tr>').join("")||empty(5,"No attendance history available");
    $("attendance-summary").textContent=(isHR()?"Company-wide: ":"Your records: ")+state.attendance.filter(a=>a.work_date===today).length+" check-ins recorded for "+dateText(today)+".";
  }
  async function markAttendance(action) {
    if(!mine())return toast("An active employee profile must be linked first.",true);
    const name=action==="in"?"hr_check_in":"hr_check_out";
    const {error}=await state.client.rpc(name,action==="in"?{p_mode:"office"}:{});
    if(error)return toast(normalizeErr(error),true);
    toast("Attendance "+(action==="in"?"check-in":"check-out")+" saved to server.");await fetchData();
  }
  function renderLeave() {
    const rows=state.leaves;
    $("leave-rows").innerHTML=rows.map(l=>{
      const act=isHR()&&l.status==="pending"?'<div class="button-row"><button class="btn tiny" data-leave-action="approved" data-leave-id="'+esc(l.id)+'">Approve</button><button class="btn tiny danger" data-leave-action="rejected" data-leave-id="'+esc(l.id)+'">Reject</button></div>':"—";
      return '<tr><td>'+esc(employeeName(l.employee_id))+'</td><td>'+esc(l.kind)+'</td><td>'+esc(dateText(l.from_date))+' – '+esc(dateText(l.to_date))+'</td><td>'+fmtStatus(l.status)+'</td><td>'+esc(l.reason)+'</td><td>'+act+'</td></tr>';
    }).join("")||empty(6,"No leave requests found");
  }
  async function submitLeave(event) {
    event.preventDefault();const e=mine();if(!e)return toast("HR must link your account to an employee record.",true);
    const f=event.target, from=formValue(f,"from_date"),to=formValue(f,"to_date");
    if(to<from)return toast("Leave end date cannot be before start date.",true);
    const record={employee_id:e.id,kind:formValue(f,"kind"),from_date:from,to_date:to,reason:formValue(f,"reason").trim(),status:"pending"};
    const {error}=await state.client.from("leave_requests").insert(record);
    if(error)return toast(normalizeErr(error),true);
    f.reset();toast("Leave request submitted for HR review.");await fetchData();
  }
  async function decideLeave(id,status) {
    if(!isHR())return;
    if(!confirm("Set this leave request to "+status+"?"))return;
    const {error}=await state.client.from("leave_requests").update({status,decided_by:state.user.id,decided_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
    if(error)return toast(normalizeErr(error),true);
    toast("Leave request "+status+".");await fetchData();
  }
  function renderCandidates() {
    $("candidate-rows").innerHTML=state.candidates.map(c=>'<tr><td><b>'+esc(c.full_name)+'</b><div class="muted">'+esc(c.email||"")+'</div></td><td>'+esc(c.position)+'</td><td>'+esc(branchName(c.branch_id))+'</td><td>'+fmtStatus(c.stage)+'</td><td>'+esc(c.notes||"—")+'</td><td><button class="btn tiny outline" data-edit-candidate="'+esc(c.id)+'">Edit</button></td></tr>').join("")||empty(6,"No candidate records yet");
  }
  function editCandidate(id) {
    if(!isHR())return;
    fillBranchOptions();
    const c=state.candidates.find(x=>x.id===id),f=$("candidate-form");f.reset();
    ["id","full_name","email","position","branch_id","stage","notes"].forEach(k=>setFormValue(f,k,c?.[k]||(k==="stage"?"Applied":"")));
    $("candidate-dialog").showModal();
  }
  async function saveCandidate(event) {
    event.preventDefault();if(!isHR())return;
    const f=event.target,id=formValue(f,"id");
    const record={full_name:formValue(f,"full_name").trim(),email:formValue(f,"email").trim()||null,position:formValue(f,"position").trim(),branch_id:formValue(f,"branch_id")||null,stage:formValue(f,"stage"),notes:formValue(f,"notes").trim()||null};
    const q=id?state.client.from("candidates").update(record).eq("id",id):state.client.from("candidates").insert(record);
    const {error}=await q;if(error)return toast(normalizeErr(error),true);
    $("candidate-dialog").close();toast("Candidate saved.");await fetchData();
  }
  function renderAccounts() {
    if(!isAdmin())return;
    $("account-rows").innerHTML=state.profiles.map(p=>{
      const self=p.id===state.user.id;
      const roles=['employee','hr','admin'].map(r=>'<option value="'+r+'" '+(p.role===r?'selected':'')+'>'+r+'</option>').join("");
      const action=self?'Your account':'<button class="btn tiny '+(p.is_active?'danger':'primary')+'" data-account-id="'+esc(p.id)+'" data-account-active="'+(!p.is_active)+'">'+(p.is_active?'Disable':'Approve')+'</button>';
      return '<tr><td>'+esc(p.email)+'</td><td>'+esc(p.full_name)+'</td><td><select class="role-picker" data-role-id="'+esc(p.id)+'" '+(self?'disabled':'')+'>'+roles+'</select></td><td>'+fmtStatus(p.is_active?'active':'pending')+'</td><td>'+action+'</td></tr>';
    }).join("")||empty(5,"No accounts registered");
  }
  async function updateRole(id,role) {
    if(!isAdmin()||id===state.user.id)return;
    if(!confirm("Change this user's access role to "+role+"?")){renderAccounts();return}
    const {error}=await state.client.from("profiles").update({role}).eq("id",id);
    if(error)return toast(normalizeErr(error),true);toast("Role changed.");await fetchData();
  }
  async function setApproval(id,active) {
    if(!isAdmin()||id===state.user.id)return;
    if(!confirm((active?"Approve":"Disable")+" this account?"))return;
    const {error}=await state.client.from("profiles").update({is_active:active}).eq("id",id);
    if(error)return toast(normalizeErr(error),true);toast("Account updated.");await fetchData();
  }
  function events() {
    $("auth-form").addEventListener("submit",submitAuth);
    $("toggle-auth").addEventListener("click",toggleAuth);
    ["logout","pending-logout"].forEach(id=>$(id).addEventListener("click",async()=>{await state.client.auth.signOut();state.user=null;state.profile=null;screen("auth-screen")}));
    $("refresh").addEventListener("click",fetchData);
    $("nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)switchView(b.dataset.view)});
    $("workspace").addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(b)switchView(b.dataset.go)});
    $("menu-toggle").addEventListener("click",()=>document.querySelector(".sidebar").classList.toggle("open"));
    $("employee-add").addEventListener("click",()=>editEmployee(""));
    $("candidate-add").addEventListener("click",()=>editCandidate(""));
    $("employee-search").addEventListener("input",renderEmployees);
    $("employee-export").addEventListener("click",exportCSV);
    $("employee-form").addEventListener("submit",saveEmployee);
    $("candidate-form").addEventListener("submit",saveCandidate);
    $("leave-form").addEventListener("submit",submitLeave);
    $("checkin").addEventListener("click",()=>markAttendance("in"));
    $("checkout").addEventListener("click",()=>markAttendance("out"));
    document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
    $("workspace").addEventListener("click",e=>{
      let b=e.target.closest("[data-edit-employee]");if(b)return editEmployee(b.dataset.editEmployee);
      b=e.target.closest("[data-edit-candidate]");if(b)return editCandidate(b.dataset.editCandidate);
      b=e.target.closest("[data-leave-action]");if(b)return decideLeave(b.dataset.leaveId,b.dataset.leaveAction);
      b=e.target.closest("[data-account-id]");if(b)return setApproval(b.dataset.accountId,b.dataset.accountActive==="true");
    });
    $("workspace").addEventListener("change",e=>{const s=e.target.closest("[data-role-id]");if(s)updateRole(s.dataset.roleId,s.value)});
  }
  async function init() {
    events();
    const config=window.PRIME_HR_CONFIG||{};
    if(!config.supabaseUrl||!config.supabasePublishableKey||config.supabaseUrl.includes("REPLACE_")||config.supabasePublishableKey.includes("REPLACE_")) {screen("setup-screen");return}
    if(!window.supabase?.createClient){screen("setup-screen");toast("Supabase browser library did not load. Check your internet connection.",true);return}
    try{
      state.client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      await loadSession();
    }catch(err){console.error(err);screen("setup-screen");toast("Cloud initialization failed. Check configuration.",true)}
  }
  document.addEventListener("DOMContentLoaded",init);
})();
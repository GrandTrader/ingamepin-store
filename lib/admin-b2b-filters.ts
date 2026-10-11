export type B2BFilters={email:string;q:string;category:string;region:string;status:string;availability:string};
export function b2bFilters(params:Partial<B2BFilters>):B2BFilters {
  return {
    email:(params.email??"").trim().toLowerCase().slice(0,254),q:(params.q??"").trim().slice(0,100),
    category:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.category??"")?params.category!:"",
    region:(params.region??"").trim().slice(0,100),
    status:["ALL","ACTIVE","INACTIVE","DRAFT"].includes(params.status??"")?params.status!:"ALL",
    availability:["enabled","disabled","all"].includes(params.availability??"")?params.availability!:"all",
  };
}
export function b2bCatalogUrl(filters:B2BFilters,page=1) {
  const values=new URLSearchParams();
  for(const [key,value] of Object.entries(filters))if(value)values.set(key,value);
  if(page>1)values.set("page",String(page));
  return "/admin/b2b-products"+(values.size?"?"+values:"");
}

export function b2bCatalogView(filters:B2BFilters,view:"all"|"active"|"disabled") {
  return b2bCatalogUrl({...filters,status:view==="active"?"ACTIVE":"ALL",availability:view==="active"?"enabled":view==="disabled"?"disabled":"all"});
}

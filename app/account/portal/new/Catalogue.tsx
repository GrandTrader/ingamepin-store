"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { portalPage, type PortalProduct } from "@/lib/business-portal";
import ProductTable from "./ProductTable";
import s from "../Portal.module.css";

export type CatalogueProduct=PortalProduct & {category_id:string|null};
export type CatalogueFilters={q?:string;region?:string;category?:string;page?:string;popular?:string};
type Category={id:string;name:string;image_url:string|null};
const regionFlags:Record<string,string>={"United States":"us","United States of America":"us",USA:"us",US:"us","United Kingdom":"gb",UK:"gb",India:"in",Canada:"ca",Australia:"au",Germany:"de",France:"fr",Japan:"jp","Saudi Arabia":"sa","United Arab Emirates":"ae",UAE:"ae",Turkey:"tr","Türkiye":"tr","European Union":"eu",Europe:"eu",EU:"eu","Hong Kong":"hk",Italy:"it",Spain:"es",Singapore:"sg"};
function filterUrl(filters:CatalogueFilters){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(filters))if(value)params.set(key,value);
  return "/account/portal/new"+(params.size?"?"+params:"");
}
export default function Catalogue({userId,products,categories,discounts,initialFilters}:{userId:string;products:CatalogueProduct[];categories:Category[];discounts:Record<string,number>;initialFilters:CatalogueFilters}){
  const regions=useMemo(()=>[...new Set(products.map(p=>p.region).filter(Boolean))].sort(),[products]);
  function normalise(value:CatalogueFilters):CatalogueFilters{
    const region=regions.includes(value.region??"")?value.region:"";
    const category=categories.some(c=>c.id===value.category&&(!region||products.some(p=>p.region===region&&p.category_id===c.id)))?value.category:"";
    return {q:value.q?.trim().slice(0,100)??"",region,category,popular:value.popular==="yes"?"yes":"",page:String(portalPage(value.page))};
  }
  const [filters,setFilters]=useState(()=>normalise(initialFilters));
  const [search,setSearch]=useState(filters.q??"");
  const container=useRef<HTMLDivElement>(null);
  const [minimumHeight,setMinimumHeight]=useState(0);
  function preserveHeight(){if(container.current)setMinimumHeight(height=>Math.max(height,container.current!.getBoundingClientRect().height));}
  function change(changes:CatalogueFilters,reset=false){
    preserveHeight();
    const next=normalise(reset?{}:{...filters,page:"1",...changes});
    setFilters(next);setSearch(next.q??"");
    // Native history updates the shareable URL without requesting a new server page.
    window.history.pushState(null,"",filterUrl(next));
  }
  useEffect(()=>{
    const restore=()=>{
      if(container.current)setMinimumHeight(height=>Math.max(height,container.current!.getBoundingClientRect().height));
      const params=new URLSearchParams(window.location.search);
      const next=normalise(Object.fromEntries(params));setFilters(next);setSearch(next.q??"");
    };
    window.history.replaceState(null,"",filterUrl(filters));
    window.addEventListener("popstate",restore);
    return()=>window.removeEventListener("popstate",restore);
    // The initial catalogue is stable for this mounted page; history restores local filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const brands=useMemo(()=>categories.filter(c=>!filters.region||products.some(p=>p.category_id===c.id&&p.region===filters.region)),[categories,products,filters.region]);
  const matching=useMemo(()=>{
    const query=(filters.q??"").toLocaleLowerCase();
    const rows=products.filter(p=>(!filters.region||p.region===filters.region)&&(!filters.category||p.category_id===filters.category)&&(!query||p.name.toLocaleLowerCase().includes(query)));
    if(filters.popular==="yes")rows.sort((a,b)=>(b.sold_count??0)-(a.sold_count??0));
    return rows;
  },[products,filters]);
  const totalPages=Math.max(1,Math.ceil(matching.length/20)),page=Math.min(portalPage(filters.page),totalPages);
  const visible=useMemo(()=>matching.slice((page-1)*20,page*20),[matching,page]);
  return <div ref={container} className={s.catalogueStable} style={{minHeight:minimumHeight||undefined}}>
    <ProductTable userId={userId} products={visible} stockProducts={products} discounts={discounts} filters={<>
      <div className={s.filterGroup}>
        <button type="button" className={s.filterChoice} aria-pressed={filters.popular!=="yes"} onClick={()=>change({popular:""})}>All products</button>
        <button type="button" className={s.filterChoice} aria-pressed={filters.popular==="yes"} onClick={()=>change({popular:"yes"})}>Popular products</button>
      </div>
      <section className={s.card} style={{marginBottom:16}}>
        <p className={s.eyebrow}>Region</p>
        <div className={`${s.filterGroup} ${s.regionChoices}`}>
          <button type="button" className={s.filterChoice} aria-pressed={!filters.region} onClick={()=>change({region:""})}>All regions</button>
          {regions.map(region=><button type="button" className={s.filterChoice} key={region} aria-pressed={filters.region===region} onClick={()=>change({region})}>{regionFlags[region]&&<Image className={s.flag} src={`/images/business-flags/${regionFlags[region]}.svg`} alt="" width={40} height={30}/>}<span>{region}</span></button>)}
        </div>
        <p className={s.eyebrow}>Brand / category</p>
        <div className={`${s.filterGroup} ${s.brandChoices}`}>
          <button type="button" className={s.filterChoice} aria-pressed={!filters.category} onClick={()=>change({category:""})}>All brands</button>
          {brands.map(c=><button type="button" className={s.filterChoice} key={c.id} aria-pressed={filters.category===c.id} onClick={()=>change({category:c.id})}>{c.image_url&&<Image className={s.brand} src={c.image_url} alt="" width={52} height={34} unoptimized/>}<span>{c.name}</span></button>)}
        </div>
      </section>
      <form className={s.toolbar} onSubmit={event=>{event.preventDefault();change({q:search});}}>
        <label className={s.search}>Search products<input name="q" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search brand or product name"/></label>
        <label>Region<select name="region" value={filters.region} onChange={e=>change({region:e.target.value})}><option value="">All regions</option>{regions.map(region=><option key={region}>{region}</option>)}</select></label>
        <label>Brand / category<select name="category" value={filters.category} onChange={e=>change({category:e.target.value})}><option value="">All brands</option>{brands.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className={s.button} type="submit">Search</button><button className={s.button} type="button" onClick={()=>change({},true)}>Reset</button>
      </form>
    </>}/>
    <div className={s.pagination}><span>{matching.length} records · Page {page} of {totalPages}</span><div className={s.actions}>{page>1&&<button className={s.button} onClick={()=>change({page:String(page-1)})}>← Previous</button>}{page<totalPages&&<button className={s.button} onClick={()=>change({page:String(page+1)})}>Next →</button>}</div></div>
  </div>;
}

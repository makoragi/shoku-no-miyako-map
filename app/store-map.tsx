"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./store-markers.css";
import { CalendarCheck, Crosshair, ExternalLink, Heart, ListFilter, LocateFixed, MapPin, Search, X } from "lucide-react";
import storesData from "./data/stores.json";
import sep19Availability from "./data/availability-2026-09-19.json";

type Store = { id:number; name:string; address:string; municipality:string; lat:number|null; lng:number|null; matchedAddress:string; geocodeStatus:string };
type UserPosition = { lat:number; lng:number };
type MappedStore = Store&{lat:number;lng:number};
const stores = storesData as Store[];
type Availability = "current"|"past";
type AvailabilityFilter = "all"|Availability;
const pastStoreIds = new Set<number>(sep19Availability.pastStoreIds);
function availabilityFor(store:Store):Availability{return pastStoreIds.has(store.id)?"past":"current"}
function availabilityLabel(store:Store){return availabilityFor(store)==="current"?"9/19時点で掲載":"過去の一覧に掲載"}
function availabilityClass(store:Store){return availabilityFor(store)==="current"?"sep18":"ineligible"}
const eligibleStoreCount = sep19Availability.storeCount;
const pastStoreCount = stores.filter((store)=>availabilityFor(store)==="past").length;

function distanceKm(a:UserPosition,b:UserPosition){const r=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,v=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return r*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v))}
function normalize(value:string){return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s/g,"")}
function navigationUrl(store:Store){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} 熊本県${store.address}`)}`}
function coordinateKey(store:MappedStore){return `${store.lat},${store.lng}`}

export default function StoreMap(){
  const mapNode=useRef<HTMLDivElement>(null),mapRef=useRef<LeafletMap|null>(null),storeLayer=useRef<LayerGroup|null>(null),userMarker=useRef<CircleMarker|null>(null),leafletRef=useRef<typeof import("leaflet")|null>(null);
  const [mapReady,setMapReady]=useState(false);
  const [renderedPointCount,setRenderedPointCount]=useState(0);
  const [visibleStoreIds,setVisibleStoreIds]=useState<Set<number>|null>(null);
  const [query,setQuery]=useState(""),[municipality,setMunicipality]=useState("すべての地域"),[selectedId,setSelectedId]=useState<number|null>(null),[availabilityFilter,setAvailabilityFilter]=useState<AvailabilityFilter>("all");
  const [userPosition,setUserPosition]=useState<UserPosition|null>(null),[locating,setLocating]=useState(false),[locationError,setLocationError]=useState("");
  const [favoritesOnly,setFavoritesOnly]=useState(false),[favorites,setFavorites]=useState<number[]>(()=>{
    if(typeof window==="undefined")return [];
    try{const saved=JSON.parse(localStorage.getItem("kumamoto-store-favorites")??"[]");return Array.isArray(saved)?saved:[]}catch{return []}
  });
  const municipalities=useMemo(()=>Array.from(new Set(stores.map(s=>s.municipality))).sort((a,b)=>a.localeCompare(b,"ja")),[]);
  const filtered=useMemo(()=>{
    const needle=normalize(query),result=stores.filter(store=>{const availability=availabilityFor(store),showPast=availabilityFilter==="past"||Boolean(needle);return(!needle||normalize(`${store.name}${store.address}`).includes(needle))&&(municipality==="すべての地域"||store.municipality===municipality)&&(availabilityFilter==="all"?availability!=="past"||showPast:availability===availabilityFilter)&&(!favoritesOnly||favorites.includes(store.id))});
    if(!userPosition)return result;
    return result.toSorted((a,b)=>{if(a.lat==null||a.lng==null)return 1;if(b.lat==null||b.lng==null)return -1;return distanceKm(userPosition,{lat:a.lat,lng:a.lng})-distanceKm(userPosition,{lat:b.lat,lng:b.lng})});
  },[query,municipality,availabilityFilter,favoritesOnly,favorites,userPosition]);
  const mappedStores=useMemo(()=>filtered.filter((s):s is MappedStore=>s.lat!=null&&s.lng!=null),[filtered]);
  const visibleStores=useMemo(()=>visibleStoreIds===null?filtered:filtered.filter(store=>visibleStoreIds.has(store.id)),[filtered,visibleStoreIds]);
  const storeGroups=useMemo(()=>{
    const groups=new Map<string,MappedStore[]>();
    mappedStores.forEach(store=>{const key=coordinateKey(store),group=groups.get(key);if(group)group.push(store);else groups.set(key,[store])});
    return Array.from(groups.values());
  },[mappedStores]);

  useEffect(()=>{
    if(!mapNode.current||mapRef.current)return;
    let cancelled=false;
    void import("leaflet").then(module=>{
      if(cancelled||!mapNode.current)return;
      const L=module.default;
      leafletRef.current=module;
      const initialZoom=window.matchMedia("(max-width: 760px)").matches?8:9;
      const map=L.map(mapNode.current,{zoomControl:true,preferCanvas:true,tapTolerance:24}).setView([32.72,130.75],initialZoom);
      L.tileLayer("https://tile.openstreetmap.jp/styles/osm-bright-ja/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> / <a href="https://tile.openstreetmap.jp/" target="_blank">OSMFJ</a>',maxNativeZoom:18,maxZoom:20}).addTo(map);
      storeLayer.current=L.layerGroup().addTo(map);
      mapRef.current=map;
      setMapReady(true);
      setTimeout(()=>map.invalidateSize(),0);
    });
    return()=>{cancelled=true;userMarker.current?.remove();mapRef.current?.remove();mapRef.current=null;storeLayer.current=null;leafletRef.current=null};
  },[]);
  useEffect(()=>{
    const mapElement=mapNode.current;
    if(!mapElement)return;
    const observer=new ResizeObserver(()=>mapRef.current?.invalidateSize());
    observer.observe(mapElement);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const L=leafletRef.current?.default,map=mapRef.current,layer=storeLayer.current;
    if(!L||!map||!layer)return;
    let frame=0;
    const draw=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        layer.clearLayers();
        const zoom=map.getZoom(),visibleBounds=map.getBounds(),bounds=visibleBounds.pad(.25),cellSize=zoom>=14?1:zoom>=12?54:zoom>=10?68:82;
        setVisibleStoreIds(new Set(mappedStores.filter(store=>visibleBounds.contains([store.lat,store.lng])).map(store=>store.id)));
        const buckets=new Map<string,{stores:MappedStore[];latSum:number;lngSum:number}>();
        storeGroups.forEach(group=>{
          const first=group[0];
          if(!bounds.contains([first.lat,first.lng]))return;
          const point=map.project([first.lat,first.lng],zoom),key=cellSize===1?coordinateKey(first):`${Math.floor(point.x/cellSize)}:${Math.floor(point.y/cellSize)}`;
          const bucket=buckets.get(key);
          if(bucket){bucket.stores.push(...group);bucket.latSum+=first.lat*group.length;bucket.lngSum+=first.lng*group.length}
          else buckets.set(key,{stores:[...group],latSum:first.lat*group.length,lngSum:first.lng*group.length});
        });
        buckets.forEach(bucket=>{
          const group=bucket.stores,first=group[0],isCluster=cellSize>1&&new Set(group.map(coordinateKey)).size>1,isMultiple=group.length>1,isSelected=group.some(store=>store.id===selectedId);
          const lat=isCluster?bucket.latSum/group.length:first.lat,lng=isCluster?bucket.lngSum/group.length:first.lng;
          if(isCluster){
            const size=group.length>=100?46:group.length>=10?40:34;
            const marker=L.marker([lat,lng],{icon:L.divIcon({className:"store-marker-shell",html:`<button class="store-cluster" type="button" aria-label="${group.length}店舗を拡大表示">${group.length}</button>`,iconSize:[size,size],iconAnchor:[size/2,size/2]}),bubblingMouseEvents:false});
            marker.on("click",()=>map.flyTo([lat,lng],Math.min(zoom+2,16),{duration:.45})).addTo(layer);
            return;
          }
          const statuses=new Set(group.map(availabilityFor)),markerStatus=statuses.size===1?availabilityClass(first):"mixed",popup=document.createElement("div");
          popup.className=`pin-popup ${isMultiple?"pin-popup-multiple":""}`;
          if(isMultiple){const heading=document.createElement("strong");heading.textContent=`この地点の店舗（${group.length}店）`;popup.append(heading)}
          group.forEach(store=>{const item=document.createElement("button"),title=document.createElement("strong"),address=document.createElement("span"),availability=document.createElement("span");item.type="button";item.className="pin-popup-store";title.textContent=store.name;address.textContent=store.address;availability.className=`popup-${availabilityClass(store)}`;availability.textContent=availabilityLabel(store);item.append(title,address,availability);item.addEventListener("click",()=>setSelectedId(store.id));popup.append(item)});
          const mapSize=map.getSize(),popupMaxHeight=Math.max(150,Math.min(360,mapSize.y-80)),popupMaxWidth=Math.max(220,Math.min(360,mapSize.x-40));
          const marker=L.marker([first.lat,first.lng],{icon:L.divIcon({className:"store-marker-shell",html:`<span class="store-marker ${isSelected?"selected":""} ${isMultiple?"multiple":""} availability-${markerStatus}">${isMultiple?group.length:""}</span>`,iconSize:[26,26],iconAnchor:[13,13],popupAnchor:[0,-13]}),bubblingMouseEvents:false}).bindPopup(popup,{closeButton:true,autoPan:false,maxHeight:popupMaxHeight,maxWidth:popupMaxWidth,minWidth:190});
          marker.on("click",()=>{if(!isMultiple)setSelectedId(first.id)}).addTo(layer);
        });
        setRenderedPointCount(buckets.size);
      });
    };
    draw();
    map.on("moveend zoomend",draw);
    return()=>{cancelAnimationFrame(frame);map.off("moveend zoomend",draw)};
  },[storeGroups,mappedStores,selectedId,mapReady]);

  function selectStore(store:Store){setSelectedId(store.id);if(store.lat!=null&&store.lng!=null)mapRef.current?.flyTo([store.lat,store.lng],15,{duration:.7})}
  function locate(){setLocating(true);setLocationError("");navigator.geolocation.getCurrentPosition(({coords})=>{const point={lat:coords.latitude,lng:coords.longitude},L=leafletRef.current?.default;setUserPosition(point);setLocating(false);userMarker.current?.remove();if(L&&mapRef.current)userMarker.current=L.circleMarker([point.lat,point.lng],{radius:8,color:"#fff",weight:4,fillColor:"#1677e8",fillOpacity:1}).addTo(mapRef.current);mapRef.current?.flyTo([point.lat,point.lng],13,{duration:.7})},()=>{setLocating(false);setLocationError("現在地を取得できませんでした。端末の位置情報設定をご確認ください。")},{enableHighAccuracy:true,timeout:10000})}
  function toggleFavorite(id:number){setFavorites(current=>{const next=current.includes(id)?current.filter(x=>x!==id):[...current,id];localStorage.setItem("kumamoto-store-favorites",JSON.stringify(next));return next})}
  const selected=stores.find(s=>s.id===selectedId)??null;

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark"><MapPin size={21} strokeWidth={2.5}/></div><div className="brand-copy"><h1>食のみやこ熊本券 <span>店舗マップ</span></h1><p><strong>非公式</strong>・9/19時点の掲載{eligibleStoreCount}店舗</p></div><nav className="source-links" aria-label="公式情報"><a className="source-link" href="https://kumamoto-tabeteouen.com/" target="_blank" rel="noreferrer">公式サイト <ExternalLink size={13}/></a></nav></header>
    <div className="launch-banner"><CalendarCheck size={18}/><span><strong>9/19時点の公式一覧を反映済みです</strong><span className="launch-count">現在掲載 {sep19Availability.storeCount}店</span><span className="launch-count">過去掲載 {pastStoreCount}店</span></span></div>
    <section className="toolbar" aria-label="店舗を絞り込む">
      <label className="search-box"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="店名・住所で検索" aria-label="店名・住所で検索"/>{query&&<button onClick={()=>setQuery("")} aria-label="検索をクリア"><X size={17}/></button>}</label>
      <label className="select-box"><ListFilter size={18}/><select value={municipality} onChange={e=>setMunicipality(e.target.value)} aria-label="地域で絞り込む"><option>すべての地域</option>{municipalities.map(name=><option key={name}>{name}</option>)}</select></label>
      <label className="select-box date-filter"><CalendarCheck size={18}/><select value={availabilityFilter} onChange={e=>setAvailabilityFilter(e.target.value as AvailabilityFilter)} aria-label="掲載状況で絞り込む"><option value="all">現在の掲載店舗</option><option value="current">9/19時点で掲載</option><option value="past">過去の一覧に掲載</option></select></label>
      <button className={`filter-button ${favoritesOnly?"active":""}`} onClick={()=>setFavoritesOnly(v=>!v)} aria-pressed={favoritesOnly}><Heart size={18} fill={favoritesOnly?"currentColor":"none"}/>お気に入り</button>
      <button className="location-button" onClick={locate} disabled={locating}><LocateFixed size={18}/>{locating?"取得中…":"現在地"}</button>
    </section>
    {locationError&&<div className="notice" role="alert">{locationError}<button onClick={()=>setLocationError("")} aria-label="閉じる"><X size={16}/></button></div>}
    <div className="workspace">
      <section className="results-panel" aria-label="地図の表示範囲内の店舗一覧"><div className="results-summary"><strong>{visibleStores.length}店</strong><span>地図の表示範囲内{userPosition?"・現在地から近い順":""}</span></div><div className="store-list" aria-live="polite">
        {visibleStores.length===0?<div className="empty-state"><Search size={27}/><strong>表示範囲内に店舗がありません</strong><span>{filtered.length===0?"検索条件を変えてお試しください。":"地図を移動するか、縮小してお試しください。"}</span></div>:visibleStores.map(store=>{const isFavorite=favorites.includes(store.id),distance=userPosition&&store.lat!=null&&store.lng!=null?distanceKm(userPosition,{lat:store.lat,lng:store.lng}):null;return <article key={store.id} className={`store-card ${selectedId===store.id?"selected":""}`} onClick={()=>selectStore(store)}><div className="store-card-main"><div className={`availability-badge ${availabilityClass(store)}`}><CalendarCheck size={13}/>{availabilityLabel(store)}</div><h2>{store.name}</h2><p><MapPin size={15}/>{store.address}</p><div className="store-meta"><span>{store.municipality}</span>{distance!=null&&<span>{distance<1?`${Math.round(distance*1000)}m`:`${distance.toFixed(1)}km`}</span>}{store.lat==null&&<span className="unmapped">地図位置未確認</span>}</div></div><button className="heart-button" onClick={e=>{e.stopPropagation();toggleFavorite(store.id)}} aria-label={isFavorite?`${store.name}をお気に入りから削除`:`${store.name}をお気に入りに追加`}><Heart size={20} fill={isFavorite?"currentColor":"none"}/></button></article>})}
      </div></section>
      <section className="map-panel" aria-label="店舗地図"><div ref={mapNode} className="map"/><div className="unofficial-badge">非公式マップ</div><button className="map-location-button" onClick={locate} aria-label="現在地を表示"><Crosshair size={20}/></button><div className="map-count">対象 <strong>{mappedStores.length}</strong> 店舗・地図上 {renderedPointCount}件</div>{selected&&<aside className="selected-place"><button className="close-card" onClick={()=>setSelectedId(null)} aria-label="店舗情報を閉じる"><X size={18}/></button><div className={`availability-badge ${availabilityClass(selected)}`}><CalendarCheck size={13}/>{availabilityLabel(selected)}</div><p>{selected.municipality}</p><h2>{selected.name}</h2><address>{selected.address}</address><div className="place-actions"><button onClick={()=>toggleFavorite(selected.id)}><Heart size={17} fill={favorites.includes(selected.id)?"currentColor":"none"}/>保存</button><a href={navigationUrl(selected)} target="_blank" rel="noreferrer">経路案内 <ExternalLink size={15}/></a></div></aside>}</section>
    </div>
    <footer>このサイトは非公式です。掲載状況は変更される場合があります。ご利用前に店舗または公式情報をご確認ください。</footer>
  </main>;
}

"use client";

export default function RegionFilterSelect({regions,value}:{regions:string[];value:string}) {
  return <select name="region" defaultValue={value} onChange={event=>event.currentTarget.form?.requestSubmit()}>
    <option value="">All regions</option>
    {regions.map(region=><option key={region}>{region}</option>)}
  </select>;
}

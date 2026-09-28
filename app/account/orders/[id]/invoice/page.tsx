import Content from "../../OrderInvoice";
export const dynamic="force-dynamic";
export default function Page(props: {params:Promise<{id:string}>;searchParams:Promise<{itemId?:string}>}) {return <Content {...props}/>;}

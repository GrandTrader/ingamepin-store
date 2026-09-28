import Content from "../OrderReceipt";
export const dynamic="force-dynamic";
export default function Page(props: {params:Promise<{id:string}>}) {return <Content {...props}/>;}

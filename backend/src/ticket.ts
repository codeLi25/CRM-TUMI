import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { Redemption } from '@prisma/client';

export const TICKET_WIDTH = 80 * 72 / 25.4;
// The same measured blocks determine paper height and rendering; no A4 scaling.
export async function ticketPdf(r: Redemption): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage:false, margin:0, info:{Title:`Ticket ${r.id}`,Author:'El Tumi'} });
  doc.registerFont('regular',fileURLToPath(new URL('../assets/inter-regular.woff',import.meta.url)));
  doc.registerFont('bold',fileURLToPath(new URL('../assets/inter-bold.woff',import.meta.url)));
  const width=TICKET_WIDTH-24;
  const date=new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Lima'}).format(r.createdAt);
  const blocks: { text:string; size:number; bold?:boolean; center?:boolean; gap?:number }[] = [
    {text:'EL TUMI',size:17,bold:true,center:true},
    {text:'TICKET DE CANJE',size:10,bold:true,center:true},
    {text:'Presentar al momento de pagar',size:8,center:true,gap:12},
    {text:`N.º ${r.id}`,size:8}, {text:`Fecha: ${date} (Lima)`,size:8,gap:10},
    {text:`Cliente: ${r.customerName}`,size:10}, {text:`Celular: ${r.customerPhone}`,size:10,gap:12},
    {text:r.promotionName,size:12,bold:true,center:true}, {text:`Código: ${r.code}`,size:11,bold:true,center:true},
    {text:r.benefit,size:12,bold:true,center:true,gap:12},
    {text:'Condiciones',size:9,bold:true}, {text:r.conditions,size:9,gap:12},
    {text:'Canje registrado. Una utilización por cliente y promoción. Reimprimir no genera otro canje.',size:8,center:true},
    {text:'El beneficio se aplica al pagar en el local. Este ticket no es un comprobante de pago.',size:8,center:true},
  ];
  const measured=blocks.map(b=>{
    doc.font(b.bold?'bold':'regular').fontSize(b.size);
    return {...b,height:doc.heightOfString(b.text,{width,lineGap:2})};
  });
  const height=24+measured.reduce((total,b)=>total+b.height+(b.gap??5),0);
  doc.addPage({size:[TICKET_WIDTH,height],margin:0});
  let y=12;
  for(const b of measured){
    doc.font(b.bold?'bold':'regular').fontSize(b.size).fillColor('#111111')
      .text(b.text,12,y,{width,lineGap:2,align:b.center?'center':'left'});
    y+=b.height+(b.gap??5);
  }
  const result=new Promise<Buffer>((resolve,reject)=>{const chunks:Buffer[]=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.end();return result;
}

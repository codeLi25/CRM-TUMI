import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import type {StatisticsReport} from './statistics.js';
const local=(s:string)=>new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(s));
const metrics=(r:StatisticsReport):[string,string|number][]=>[
 ['Desde (Lima)',r.from],['Hasta (Lima, inclusivo)',r.to],['Generado (Lima)',local(r.generatedAt)],['Clientes registrados en el período',r.totals.registrations],['Canjes emitidos',r.totals.redemptions],['Promociones del período (no eliminadas)',r.totals.promotions],['Correos aceptados por el proveedor',r.totals.accepted],['Correos fallidos',r.totals.failed],['Correos simulados (sin envío)',r.totals.simulated],['Resultados inciertos',r.totals.uncertain],['Destinatarios omitidos',r.totals.skipped],['Pares cliente/promoción con aceptación del proveedor',r.totals.receivers],['Pares con canje posterior',r.totals.conversions],['Conversión de correo (%)',r.totals.conversion??'Sin destinatarios'],['Canjes sin atribución a envíos del período',r.totals.unattributed],['Clientes totales actuales',r.current.customers],['Suscritos actuales',r.current.subscribers],['Destinatarios pendientes actuales',r.current.pending],['Destinatarios en proceso actuales',r.current.sending],
];
export async function statisticsExcel(r:StatisticsReport){
 const book=new ExcelJS.Workbook();book.creator='CRM El Tumi';book.created=new Date(r.generatedAt);
 function sheet(name:string,headers:string[],rows:(string|number|boolean|null)[][]){const s=book.addWorksheet(name);s.columns=headers.map(h=>({header:h,width:Math.min(42,Math.max(20,h.length+3))}));s.addRows(rows);s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:headers.length}};s.getRow(1).height=30;s.getRow(1).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1B4332'}};c.font={bold:true,color:{argb:'FFFFFFFF'}};c.alignment={wrapText:true,vertical:'middle'};});s.eachRow((row,n)=>{if(n>1)row.eachCell(c=>{c.alignment={vertical:'top',wrapText:true};if(n%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F6EE'}};});});if(name==="Resumen"){s.getColumn(1).width=55;s.getColumn(2).width=100;}s.eachRow((row,n)=>{if(n>1){let lines=1;row.eachCell((cell,col)=>{lines=Math.max(lines,Math.ceil(String(cell.value??"").length/Math.max(10,(s.getColumn(col).width??20)-3)));});row.height=Math.max(22,lines*15+8);}});return s;}
 sheet('Resumen',['Indicador','Valor'],[...metrics(r),['Criterios',r.methodology],['Promociones','Vigencia que cruza el período o actividad de canjes/correos en él. Las eliminadas solo se incluyen si tienen actividad.'],['Clientes','Fecha de registro dentro del período. Canjes acumulados y segmento actuales.'],['Correos','Aceptación del proveedor no confirma entrega en bandeja.']]);
 sheet('Actividad diaria',['Fecha (Lima)','Registros','Canjes'],r.daily.map(d=>[d.date,d.registrations,d.redemptions]));
 sheet('Segmentos actuales',['Segmento','Clientes'],r.current.segments.map(s=>[s.label,s.count]));
 sheet('Clientes',['ID','Nombre','Correo','Teléfono','Registro (Lima)','Suscrito','Segmento actual','Canjes acumulados','Último canje (Lima)'],r.customers.map(c=>[c.id,c.name,c.email,c.phone,local(c.createdAt),c.subscribed?'Sí':'No',c.segment,c.redemptionCount,c.lastRedemptionAt?local(c.lastRedemptionAt):'Sin canjes']));
 sheet('Promociones',['ID','Promoción','Código','Estado actual','Inicio (Lima)','Fin (Lima)','Límite total','Usos acumulados','Canjes del período','Receptores de correo únicos','Canjes posteriores','Conversión (%)'],r.promotions.map(p=>[p.id,p.name,p.code,p.state,local(p.startsAt),local(p.endsAt),p.limit??'Sin límite',p.totalUses,p.uses,p.receivers,p.conversions,p.conversion]));
 sheet('Canjes',['Ticket','Cliente','Teléfono','Promoción','Código','Fecha (Lima)','Beneficio histórico','Atribuido al correo del período'],r.redemptions.map(c=>[c.id,c.customerName,c.customerPhone,c.promotionName,c.code,local(c.createdAt),c.benefit,c.attributed?'Sí':'No']));
 // Values are strings/numbers, never formula objects, including names starting with =.
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function statisticsPdf(r:StatisticsReport){
 const doc=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:`Estadísticas El Tumi ${r.from} - ${r.to}`,Author:'CRM El Tumi'}});
 doc.registerFont('regular',fileURLToPath(new URL('../assets/inter-regular.woff',import.meta.url)));doc.registerFont('bold',fileURLToPath(new URL('../assets/inter-bold.woff',import.meta.url)));
 const result=new Promise<Buffer>((resolve,reject)=>{const chunks:Buffer[]=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const width=doc.page.width-84;
 function text(value:string,size=10,bold=false){doc.font(bold?'bold':'regular').fontSize(size).fillColor('#213D2C');const height=doc.heightOfString(value,{width,lineGap:3});if(doc.y+height>doc.page.height-66){doc.addPage();}doc.text(value,42,doc.y,{width,lineGap:3});doc.moveDown(.5);}
 function heading(value:string){if(doc.y>doc.page.height-125)doc.addPage();doc.moveDown(.5);text(value,15,true);}
 text('EL TUMI · REPORTE CRM',22,true);text(`${r.from} al ${r.to} · America/Lima`,11);text(`Generado: ${local(r.generatedAt)}`,9);heading('Resumen del período');
 for(const [label,value] of metrics(r).slice(3,15)){text(`${label}: ${value}`,10);}
 heading('Distribución actual de clientes');for(const s of r.current.segments)text(`${s.label}: ${s.count}`);
 heading('Criterios de lectura');text(r.methodology,9);text('Aceptación del proveedor no confirma entrega en bandeja. Los canjes sin atribución pueden proceder de correos anteriores al período o de clientes que conocían el código por otro medio.',9);text('Promociones: vigencia que cruza el período o actividad de correo/canje en él. Eliminadas incluidas solo con actividad. Excel contiene los listados completos filtrados.',9);
 doc.addPage();text('Actividad y promociones',20,true);heading('Registros y canjes por mes');
 const months=new Map<string,{registrations:number;redemptions:number}>();for(const day of r.daily){const key=day.date.slice(0,7),m=months.get(key)??{registrations:0,redemptions:0};m.registrations+=day.registrations;m.redemptions+=day.redemptions;months.set(key,m);}
 for(const [month,m] of months)text(`${month}     Registros: ${m.registrations}     Canjes: ${m.redemptions}`);
 heading('Rendimiento de promociones');
 if(r.promotions.length>20)text(`Las 20 promociones con más canjes de ${r.promotions.length}. El Excel incluye el listado completo.`,9);
 if(!r.promotions.length)text('Sin promociones ni actividad en el período seleccionado.');
 for(const p of r.promotions.slice(0,20)){if(doc.y>doc.page.height-150)doc.addPage();text(`${p.name} (${p.code})`,11,true);text(`${p.state} · Canjes: ${p.uses} · Receptores de correo únicos: ${p.receivers} · Canjes posteriores: ${p.conversions} · Conversión: ${p.conversion===null?'Sin destinatarios':p.conversion+'%'}`,9);}
 const pages=doc.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('regular').fontSize(8).fillColor('#68776B').text(`El Tumi · ${r.from} al ${r.to} · Página ${i+1} de ${pages.count}`,42,doc.page.height-35,{width,lineBreak:false});doc.page.margins.bottom=bottom;}
 doc.end();return result;
}


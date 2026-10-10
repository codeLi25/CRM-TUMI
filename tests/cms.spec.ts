import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('CMS draft, images, dishes, preview and publication',async({page},info)=>{
 test.setTimeout(90000);page.setDefaultTimeout(15000);
 const credentials=JSON.parse(readFileSync('.local/e2e-admin.json','utf8'));
 await page.goto('/admin');await page.getByLabel('Correo electrónico',{exact:true}).fill(credentials.email);await page.getByLabel('Contraseña de Acceso').fill(credentials.password);await page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Dashboard General'})).toBeVisible();
 const original=(await (await page.request.get('/api/v1/admin/cms')).json()),headers={Origin:'http://localhost:5174'};
 try{
 await page.goto('/admin/contenido');await page.getByLabel('Título principal',{exact:true}).fill('Temporada CMS E2E');
 await page.getByLabel('Imagen principal',{exact:true}).setInputFiles('frontend/public/assets/figma/a5129.png');await expect(page.getByText('Imagen cargada en el borrador.')).toBeVisible();
 await page.getByRole('button',{name:'Carta',exact:true}).click();await page.getByLabel('Filtrar categoría').selectOption('Bebidas');await page.getByRole('button',{name:'Añadir plato'}).click();await page.locator('summary').filter({hasText:'Nuevo plato'}).click();await page.getByLabel('Nombre del plato').fill('Bebida CMS E2E');await page.getByLabel('Precio (S/)').fill('8.50');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(page.getByText('Borrador guardado. La web pública no ha cambiado.')).toBeVisible();
 const live=await (await page.request.get('/api/v1/public/content')).json();expect(live.content.hero.title).toBe(original.published.hero.title);
 await page.getByRole('button',{name:'Vista previa',exact:true}).click();const frame=page.frameLocator('iframe');await expect(frame.getByRole('heading',{level:1,name:'Temporada CMS E2E'})).toBeVisible({timeout:15000});await frame.getByRole('button',{name:'Bebidas',exact:true}).click();await expect(frame.getByRole('heading',{name:'Bebida CMS E2E'})).toBeVisible();await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('button',{name:'Publicar cambios',exact:true}).click();await page.getByRole('button',{name:'Confirmar publicación'}).click();await expect(page.getByText('Contenido publicado correctamente.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('cms-carta.png'),fullPage:true});
 await page.goto('/');await expect(page.getByRole('heading',{level:1,name:'Temporada CMS E2E'})).toBeVisible();await page.getByRole('button',{name:'Bebidas',exact:true}).click();await expect(page.getByRole('heading',{name:'Bebida CMS E2E'})).toBeVisible();await expect(page.locator('#menu')).toContainText('8.50');
 }finally{
 test.setTimeout(120000);
 let current=await (await page.request.get('/api/v1/admin/cms')).json();let response=await page.request.post('/api/v1/admin/cms/draft',{headers,data:{revision:current.revision,content:original.published}});expect(response.ok()).toBe(true);current=await response.json();expect((await page.request.post('/api/v1/admin/cms/publish',{headers,data:{revision:current.revision}})).ok()).toBe(true);
 if(JSON.stringify(original.draft)!==JSON.stringify(original.published)){current=await (await page.request.get('/api/v1/admin/cms')).json();await page.request.post('/api/v1/admin/cms/draft',{headers,data:{revision:current.revision,content:original.draft}});}
 }
});

test('CMS manages carousel, gallery and reviews, ordering, visibility and deletion',async({page},info)=>{
 test.setTimeout(90000);page.setDefaultTimeout(15000);
 const credentials=JSON.parse(readFileSync('.local/e2e-admin.json','utf8'));
 await page.goto('/admin');await page.getByLabel('Correo electrónico',{exact:true}).fill(credentials.email);await page.getByLabel('Contraseña de Acceso').fill(credentials.password);await page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Dashboard General'})).toBeVisible();
 const original=await (await page.request.get('/api/v1/admin/cms')).json(),headers={Origin:'http://localhost:5174'};
 try{
 await page.goto('/admin/contenido');await page.getByRole('button',{name:'Promociones web',exact:true}).click();await page.getByRole('button',{name:'Añadir banner'}).click();
 let item=page.locator('details').last();await item.locator('summary').click();await item.getByLabel('Descripción de la imagen',{exact:true}).fill('Banner CMS E2E');await item.getByLabel('Título superpuesto (opcional)').fill('Oferta estacional E2E');await item.getByRole('button',{name:'Subir',exact:true}).click();
 await page.getByRole('button',{name:'Galería',exact:true}).click();await page.getByRole('button',{name:'Añadir fotografía'}).click();item=page.locator('details').last();await item.locator('summary').click();await item.getByLabel('Descripción de la imagen',{exact:true}).fill('Galería CMS E2E');await item.getByLabel('Tamaño en la galería').selectOption('wide');await item.getByLabel('Visible en la web').uncheck();
 await page.getByRole('button',{name:'Opiniones',exact:true}).click();await page.getByRole('button',{name:'Añadir opinión'}).click();item=page.locator('details').last();await item.locator('summary').click();await item.getByLabel('Nombre del cliente').fill('Opinión CMS E2E');await item.getByLabel('Opinión',{exact:true}).fill('Experiencia de prueba E2E');await item.getByLabel('Estrellas').selectOption('4');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(page.getByText('Borrador guardado. La web pública no ha cambiado.')).toBeVisible();await page.reload();await page.getByRole('button',{name:'Opiniones',exact:true}).click();await expect(page.locator('summary').last()).toContainText('Opinión CMS E2E');
 await page.getByRole('button',{name:'Publicar cambios',exact:true}).click();await page.getByRole('button',{name:'Confirmar publicación'}).click();await expect(page.getByText('Contenido publicado correctamente.')).toBeVisible();
 const live=await (await page.request.get('/api/v1/public/content')).json();expect(live.content.banners[original.draft.banners.length-1].alt).toBe('Banner CMS E2E');expect(live.content.gallery.some((g:any)=>g.alt==='Galería CMS E2E')).toBe(false);expect(live.content.reviews.at(-1).rating).toBe(4);
 await page.locator('summary').last().click();await page.locator('details').last().getByRole('button',{name:'Eliminar',exact:true}).click();await page.getByRole('button',{name:'Confirmar eliminación'}).click();await expect(page.locator('summary').filter({hasText:'Opinión CMS E2E'})).toHaveCount(0);
 await page.getByRole('button',{name:'Descartar borrador',exact:true}).click();await page.getByRole('button',{name:'Confirmar descarte'}).click();await expect(page.locator('summary').last()).toContainText('Opinión CMS E2E');
 await page.getByRole('button',{name:'Inicio',exact:true}).click();await page.getByRole('button',{name:'Cerrar aviso'}).click();await page.screenshot({path:info.outputPath('cms-inicio.png'),fullPage:true});
 }finally{test.setTimeout(120000);let doc=await (await page.request.get('/api/v1/admin/cms')).json();doc=await (await page.request.post('/api/v1/admin/cms/draft',{headers,data:{revision:doc.revision,content:original.published}})).json();expect((await page.request.post('/api/v1/admin/cms/publish',{headers,data:{revision:doc.revision}})).ok()).toBe(true);if(JSON.stringify(original.draft)!==JSON.stringify(original.published)){await page.request.post('/api/v1/admin/cms/draft',{headers,data:{revision:doc.revision,content:original.draft}});}}
});


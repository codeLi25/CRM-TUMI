import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { hashPassword } from './security.js';

async function hiddenPassword(): Promise<string> {
  if (!stdin.isTTY) throw new Error('Usa una terminal interactiva para introducir la contraseña.');
  stdout.write('Contraseña (12–128 caracteres, entrada oculta): ');
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') { finish(); reject(new Error('Cancelado.')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}
const db = new PrismaClient();
try {
  if (await db.admin.count()) throw new Error('Ya existe un administrador. Usa la recuperación de contraseña; este comando no sobrescribe cuentas.');
  const prompt = createInterface({ input: stdin, output: stdout });
  const name = await prompt.question('Nombre del administrador: ');
  const email = await prompt.question('Correo: ');
  prompt.close();
  const password = await hiddenPassword();
  const data = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) }).parse({ name, email, password });
  await db.admin.create({ data: { name: data.name, email: data.email, passwordHash: await hashPassword(data.password) } });
  console.log('Administrador creado. Ya puedes iniciar sesión.');
} catch (error) {
  console.error(error instanceof z.ZodError ? 'Datos inválidos. Comprueba nombre, correo y longitud de contraseña.' : error instanceof Error && !('code' in error) ? error.message : 'No se pudo crear el administrador. Comprueba la base de datos y las migraciones.');
  process.exitCode = 1;
} finally { await db.$disconnect(); }

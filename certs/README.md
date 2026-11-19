# Certificado CA de Supabase

La API valida el certificado de Supabase al conectarse (`sslmode=verify-full`). Para eso necesita el certificado CA del proyecto, guardado en esta carpeta como **`supabase-ca.crt`**.

## Cómo obtenerlo

1. En el panel de Supabase: **Project Settings → Database → SSL Configuration → Download certificate**.
2. Guardá el archivo descargado (`prod-ca-2021.crt`) acá con el nombre `supabase-ca.crt`.
3. En `DATABASE_URL`, al final de la cadena del transaction pooler:

   ```
   ?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt
   ```

   La ruta es relativa a la raíz del proyecto, que es desde donde corren `npm start`, el seed y el contenedor.

4. Comprobalo con `npm run db:verificar`: tiene que decir `Certificado: validado`.

## ¿Se sube al repositorio?

Sí. Es un certificado **público** que solo sirve para verificar la identidad del servidor; no da acceso a la base. Lo secreto es la contraseña, que va solo en el `.env`.

## ¿Y `sslmode=no-verify`?

No se usa. Cifra la conexión, pero acepta cualquier certificado, así que no protege contra alguien que se haga pasar por el servidor.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Verificação de Segurança das Variáveis
if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  console.error("ERRO CRÍTICO: Variáveis de ambiente do R2 não encontradas.");
}

// Configura o cliente do Cloudflare R2
// MUDANÇA IMPORTANTE: Region 'us-east-1' é obrigatório para compatibilidade com R2
const S3 = new S3Client({
  region: "us-east-1",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { filename, filetype } = req.body;
    
    // Limpeza do nome do arquivo
    const cleanFileName = filename.replace(/\s+/g, '-').replace(/[^\w\.-]/g, '');
    const uniqueName = `${Date.now()}-${cleanFileName}`;

    console.log(`1. Iniciando geração de link para: ${uniqueName}`);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: uniqueName,
      ContentType: filetype,
    });

    // Gera URL assinada (20 minutos de validade)
    console.log("2. Solicitando assinatura ao R2...");
    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 1200 });
    console.log("3. Link gerado com sucesso.");
    
    // Corrige URL pública (remove barra final se houver)
    const publicBase = process.env.R2_PUBLIC_URL ? process.env.R2_PUBLIC_URL.replace(/\/$/, "") : "";
    const finalPublicUrl = `${publicBase}/${uniqueName}`;

    return res.status(200).json({ uploadUrl, publicUrl: finalPublicUrl });
  } catch (error) {
    console.error("ERRO R2:", error);
    return res.status(500).json({ error: 'Erro ao conectar com R2', details: error.message });
  }
}

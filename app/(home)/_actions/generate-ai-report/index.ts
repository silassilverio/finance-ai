"use server";

import { db } from "@/app/_lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Groq from "groq-sdk";
import { GenerateAiReportSchema, generateAiReportSchema } from "./schema";

export const generateAiReport = async ({ month }: GenerateAiReportSchema) => {
  generateAiReportSchema.parse({ month });
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  const user = await clerkClient().users.getUser(userId);
  const hasPremiumPlan = user.publicMetadata.subscriptionPlan === "premium";
  if (!hasPremiumPlan) {
    throw new Error(
      "Você precisa de um plano premium para gerar relatórios com IA",
    );
  }
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  //pegar as transações do mês recebido
  const transactions = await db.transaction.findMany({
    where: {
      date: {
        gte: new Date(`2024-${month}-01`),
        lt: new Date(`2024-${month}-31`),
      },
    },
  });
  //mandar as transações para a IA e pedir para ela gerar um relatório com insigths
  const content = `Gere um relatório com insights sobre as minhas finanças, com dicas e orientações de como melhorar
   minha vida financeira. As transações estão divididas por ponto e vírgula. A estrutura de cada uma é {DATA}-{TIPO}-
   {VALOR}-{CATEGORIA}. São elas:
   ${transactions
     .map(
       (transaction) =>
         `${transaction.date.toLocaleDateString("pt-BR")}-R$${transaction.amount}-${transaction.type}-${transaction.category}`,
     )
     .join(";")}`;
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "Você é um especialista em gestão e organização de finanças pessoais. Você ajuda as pessoas a organizarem melhor as suas finanças.",
      },
      {
        role: "user",
        content,
      },
    ],
    model: "llama3-8b-8192",
  });
  // Pegar o relatório gerado pela IA e retornar para o usuário
  return completion.choices[0].message.content;
};

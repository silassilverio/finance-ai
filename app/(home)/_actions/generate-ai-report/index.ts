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

  const currentYear = new Date().getFullYear();
  const monthIndex = Number(month) - 1;
  const startDate = new Date(currentYear, monthIndex, 1);
  const endDate = new Date(currentYear, monthIndex + 1, 1);

  const transactions = await db.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lt: endDate,
      },
    },
  });

  const content = `Gere um relatório detalhado com insights sobre as minhas finanças do mês, com dicas e orientações de como melhorar minha vida financeira. Utilize os dados abaixo para análise.

As transações estão separadas por ponto e vírgula, no formato: {NOME}-{TIPO}-{VALOR}-{CATEGORIA}-{MÉTODO DE PAGAMENTO}-{DATA}

Transações:
${transactions
  .map(
    (transaction) =>
      `${transaction.name}-${transaction.type}-R$${transaction.amount}-${transaction.category}-${transaction.paymentMethod}-${transaction.date.toLocaleDateString("pt-BR")}`,
  )
  .join(";")}

Por favor, inclua no relatório:
1. Resumo geral das finanças do mês
2. Principais categorias de gastos
3. Pontos de atenção
4. Dicas personalizadas de economia e melhorias
5. Avaliação geral da saúde financeira no mês`;

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
    model: "llama-3.3-70b-versatile",
  });
  // Pegar o relatório gerado pela IA e retornar para o usuário
  return completion.choices[0].message.content;
};

import "server-only";
import { db } from "@/server/db";

// Career memory (SPEC §4 CareerFact): short facts the user wants CareerOS to remember ("I won't relocate",
// "Prefer product companies"). Later phases may suggest facts; they wait as "pending" until the user accepts them.

export type CareerFactInput = { text: string; category: string };

export async function listCareerFacts(userId: string) {
  return db.careerFact.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}

export async function createCareerFact(userId: string, fact: CareerFactInput) {
  return db.careerFact.create({ data: { userId, ...fact, source: "user", status: "active" } });
}

export async function updateCareerFact(userId: string, id: string, fact: CareerFactInput) {
  const { count } = await db.careerFact.updateMany({ where: { id, userId }, data: fact });
  return count === 1;
}

export async function setCareerFactStatus(userId: string, id: string, status: "active" | "archived") {
  const { count } = await db.careerFact.updateMany({ where: { id, userId }, data: { status } });
  return count === 1;
}

export async function deleteCareerFact(userId: string, id: string) {
  const { count } = await db.careerFact.deleteMany({ where: { id, userId } });
  return count === 1;
}

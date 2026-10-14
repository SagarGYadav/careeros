import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AddJobForm } from "@/features/add-job/add-job-form";

export const metadata: Metadata = { title: "Add job" };

export default function AddJobPage() {
  return (
    <>
      <PageHeader
        title="Add job"
        description="A job you found elsewhere. It is cleaned and checked for duplicates like search results, then you can analyse your fit."
      />
      <AddJobForm />
    </>
  );
}

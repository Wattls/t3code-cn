import { createFileRoute } from "@tanstack/react-router";
import { CompanyPage } from "../components/company/CompanyPage";
export const Route = createFileRoute("/_chat/company")({ component: CompanyPage });

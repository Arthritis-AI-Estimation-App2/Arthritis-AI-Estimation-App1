import {
  normalizeAdminScreeningFilters,
  type AdminScreeningFilters,
} from "./admin-screening-filters.ts";

export type StaffScreeningFilters = Omit<AdminScreeningFilters, "clinicId">;

type RawStaffScreeningFilters = {
  from?: string;
  to?: string;
  status?: string;
  subject?: string;
  id?: string;
  page?: string;
};

export function normalizeStaffScreeningFilters(
  raw: RawStaffScreeningFilters
): StaffScreeningFilters {
  const { clinicId: _clinicId, ...filters } = normalizeAdminScreeningFilters(raw);
  return filters;
}

export function staffScreeningListHref(
  filters: StaffScreeningFilters,
  page: number
) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  if (filters.subjectId) params.set("subject", filters.subjectId);
  if (filters.screeningIdInput) params.set("id", filters.screeningIdInput);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/screenings?${query}` : "/screenings";
}

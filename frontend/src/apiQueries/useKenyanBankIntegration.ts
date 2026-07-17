import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/constants/envVariables";
import { fetchApi } from "@/helpers/fetchApi";
import { AppError, KenyanBankIntegrationResponse } from "@/types";

export const useKenyanBankIntegration = () => {
  return useQuery<KenyanBankIntegrationResponse, AppError>({
    queryKey: ["kenyan-bank-integration"],
    queryFn: () => fetchApi(`${API_URL}/kenyan-bank-integration`),
  });
};

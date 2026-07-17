import { useMutation, useQueryClient } from "@tanstack/react-query";

import { API_URL } from "@/constants/envVariables";
import { fetchApi } from "@/helpers/fetchApi";
import { AppError, KenyanBankIntegration, KenyanBankIntegrationUpdate } from "@/types";

export const useUpdateKenyanBankIntegration = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: KenyanBankIntegrationUpdate) =>
      fetchApi(`${API_URL}/kenyan-bank-integration`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kenyan-bank-integration"] });
    },
  });

  return {
    ...mutation,
    error: mutation.error as AppError,
    data: mutation.data as KenyanBankIntegration,
  };
};

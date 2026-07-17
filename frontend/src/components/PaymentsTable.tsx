import { useNavigate } from "react-router-dom";

import { Button, Icon, Link, Notification, Card } from "@stellar/design-system";

import { AssetAmount } from "@/components/AssetAmount";
import { ErrorWithExtras } from "@/components/ErrorWithExtras";
import { PaymentStatus } from "@/components/PaymentStatus";
import { Table } from "@/components/Table";

import { Routes } from "@/constants/settings";

import { formatDateTime } from "@/helpers/formatIntlDateTime";
import { formatPaymentType } from "@/helpers/formatPaymentType";

import { ApiPayment } from "@/types";

interface PaymentsTableProps {
  paymentItems: ApiPayment[];
  apiError: string | undefined;
  isFiltersSelected: boolean | undefined;
  isLoading: boolean;
}

export const PaymentsTable = ({
  paymentItems,
  apiError,
  isFiltersSelected,
  isLoading,
}: PaymentsTableProps) => {
  const navigate = useNavigate();

  const handlePaymentClicked = (paymentId: string) => {
    navigate(`${Routes.PAYMENTS}/${paymentId}`);
  };

  const handlePaymentDisbursementClicked = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    disbursementId: string,
  ) => {
    event.preventDefault();
    navigate(`${Routes.DISBURSEMENTS}/${disbursementId}`);
  };

  if (apiError) {
    return (
      <Notification variant="error" title="Error" isFilled={true}>
        <ErrorWithExtras
          appError={{
            message: apiError,
          }}
        />
      </Notification>
    );
  }

  if (paymentItems?.length === 0) {
    if (isLoading) {
      return <div className="Note">Loading…</div>;
    }

    if (isFiltersSelected) {
      return <div className="Note">There are no payments matching your selected filters</div>;
    }

    return <div className="Note">There are no payments</div>;
  }

  return (
    <div className="FiltersWithSearch">
      <Card noPadding>
        <Table isLoading={isLoading} isScrollable={true}>
          <Table.Header>
            {/* TODO: put back once ready */}
            {/* <Table.HeaderCell>
            <Checkbox id="payments-select-all" fieldSize="xs" />
          </Table.HeaderCell> */}
            <Table.HeaderCell>Transaction ID</Table.HeaderCell>
            <Table.HeaderCell>Disbursement name</Table.HeaderCell>
            <Table.HeaderCell width="9.375rem">Completed at</Table.HeaderCell>
            <Table.HeaderCell textAlign="right" width="8.125rem">
              Amount
            </Table.HeaderCell>
            <Table.HeaderCell textAlign="right" width="9rem">
              Status
            </Table.HeaderCell>
            <Table.HeaderCell>Type</Table.HeaderCell>
          </Table.Header>

          <Table.Body>
            {paymentItems.map((p, index) => (
              // Using index here to make sure UI works if we have duplicate entries
              // Otherwise, table data is not updating
              <Table.BodyRow key={`${p.id}-${p.created_at}-${index}`}>
                {/* TODO: put back once ready */}
                {/* <Table.BodyCell width="1rem">
                <Checkbox id={`payment-${p.id}`} fieldSize="xs" />
              </Table.BodyCell> */}
                <Table.BodyCell width="10rem" title={p.id}>
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={<Icon.FileCode01 />}
                    onClick={() => handlePaymentClicked(p.id)}
                  >
                    {p.external_payment_id ?? "Transaction ID"}
                  </Button>
                </Table.BodyCell>
                <Table.BodyCell width="7.5rem" title={p.disbursement?.name || "-"}>
                  {(() => {
                    const disbursement = p.disbursement;
                    return disbursement ? (
                      <Link
                        onClick={(event) =>
                          handlePaymentDisbursementClicked(event, disbursement.id)
                        }
                      >
                        {disbursement.name}
                      </Link>
                    ) : (
                      "-"
                    );
                  })()}
                </Table.BodyCell>
                <Table.BodyCell>
                  <span className="Table-v2__cell--secondary">
                    {p.status === "SUCCESS" ? formatDateTime(p.updated_at) : "-"}
                  </span>
                </Table.BodyCell>
                <Table.BodyCell textAlign="right">
                  <AssetAmount amount={p.amount} assetCode={p.asset.code} fallback="-" />
                </Table.BodyCell>
                <Table.BodyCell textAlign="right">
                  <PaymentStatus status={p.status} />
                </Table.BodyCell>
                <Table.BodyCell>
                  <span className="Table-v2__cell--secondary">{formatPaymentType(p)}</span>
                </Table.BodyCell>
              </Table.BodyRow>
            ))}
          </Table.Body>
        </Table>
      </Card>
    </div>
  );
};

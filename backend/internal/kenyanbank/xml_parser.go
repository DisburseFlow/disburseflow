package kenyanbank

import (
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// CreditAdvice is the parsed, bank-agnostic representation of an inbound
// KES credit notification. Both Equity Bank proprietary XML and KCB MT103-style
// XML are normalised into this struct before further processing.
type CreditAdvice struct {
	MessageID       string
	Bank            string
	Amount          float64
	Currency        string
	ValueDate       time.Time
	SenderName      string
	SenderAccount   string
	SenderBank      string
	Narration       string
	ReferenceNumber string
}

// ParseCreditAdvice auto-detects the XML dialect (Equity, KCB, or ISO 20022
// camt.054) and returns a normalised CreditAdvice.
func ParseCreditAdvice(payload []byte) (*CreditAdvice, error) {
	// Peek at the root element to decide the dialect.
	root, err := xmlRootElement(payload)
	if err != nil {
		return nil, fmt.Errorf("reading XML root element: %w", err)
	}

	switch root {
	case "CreditAdvice":
		return parseEquityXML(payload)
	case "MT103":
		return parseKCBXML(payload)
	case "Document":
		return parseCamt054XML(payload)
	default:
		return nil, fmt.Errorf("unrecognised XML dialect: root element <%s>", root)
	}
}

// ── Equity Bank format ───────────────────────────────────────────────────────

type equityCreditAdvice struct {
	XMLName         xml.Name `xml:"CreditAdvice"`
	MessageID       string   `xml:"MessageID"`
	BankCode        string   `xml:"BankCode"`
	TransactionDate string   `xml:"TransactionDate"`
	Amount          string   `xml:"Amount"`
	Currency        string   `xml:"Currency"`
	Narration       string   `xml:"Narration"`
	ReferenceNumber string   `xml:"ReferenceNumber"`
	SenderName      string   `xml:"SenderName"`
	SenderAccount   string   `xml:"SenderAccount"`
	SenderBank      string   `xml:"SenderBank"`
	CreditAccount   string   `xml:"CreditAccount"`
}

func parseEquityXML(data []byte) (*CreditAdvice, error) {
	var doc equityCreditAdvice
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parsing Equity XML: %w", err)
	}
	if doc.MessageID == "" {
		return nil, fmt.Errorf("Equity XML missing MessageID")
	}
	amount, err := parseAmount(doc.Amount)
	if err != nil {
		return nil, fmt.Errorf("Equity XML invalid Amount %q: %w", doc.Amount, err)
	}
	valueDate, _ := parseDate(doc.TransactionDate)
	ccy := doc.Currency
	if ccy == "" {
		ccy = "KES"
	}
	return &CreditAdvice{
		MessageID:       doc.MessageID,
		Bank:            "EQUITY",
		Amount:          amount,
		Currency:        strings.ToUpper(ccy),
		ValueDate:       valueDate,
		SenderName:      doc.SenderName,
		SenderAccount:   doc.SenderAccount,
		SenderBank:      doc.SenderBank,
		Narration:       doc.Narration,
		ReferenceNumber: doc.ReferenceNumber,
	}, nil
}

// ── KCB MT103-style format ───────────────────────────────────────────────────

type kcbMT103 struct {
	XMLName   xml.Name `xml:"MT103"`
	MsgId     string   `xml:"MsgId"`
	TxnDate   string   `xml:"TxnDate"`
	Amount    string   `xml:"Amount"`
	CCY       string   `xml:"CCY"`
	Ordering  struct {
		Name    string `xml:"Name"`
		Account string `xml:"Account"`
		Bank    string `xml:"Bank"`
	} `xml:"OrderingCustomer"`
	Beneficiary struct {
		Account string `xml:"Account"`
		Name    string `xml:"Name"`
	} `xml:"BeneficiaryCustomer"`
	RemittanceInfo string `xml:"RemittanceInfo"`
	Reference      string `xml:"Reference"`
}

func parseKCBXML(data []byte) (*CreditAdvice, error) {
	var doc kcbMT103
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parsing KCB XML: %w", err)
	}
	if doc.MsgId == "" {
		return nil, fmt.Errorf("KCB XML missing MsgId")
	}
	amount, err := parseAmount(doc.Amount)
	if err != nil {
		return nil, fmt.Errorf("KCB XML invalid Amount %q: %w", doc.Amount, err)
	}
	valueDate, _ := parseDate(doc.TxnDate)
	ccy := doc.CCY
	if ccy == "" {
		ccy = "KES"
	}
	return &CreditAdvice{
		MessageID:       doc.MsgId,
		Bank:            "KCB",
		Amount:          amount,
		Currency:        strings.ToUpper(ccy),
		ValueDate:       valueDate,
		SenderName:      doc.Ordering.Name,
		SenderAccount:   doc.Ordering.Account,
		SenderBank:      doc.Ordering.Bank,
		Narration:       doc.RemittanceInfo,
		ReferenceNumber: doc.Reference,
	}, nil
}

// ── ISO 20022 camt.054.001.08 ────────────────────────────────────────────────
// Minimal subset — just what we need to extract the credit entry.

type camt054Document struct {
	XMLName xml.Name `xml:"Document"`
	Ntfctn  struct {
		Id    string `xml:"Id"`
		Ntry  []struct {
			Amt struct {
				Value string `xml:",chardata"`
				Ccy   string `xml:"Ccy,attr"`
			} `xml:"Amt"`
			CdtDbtInd string `xml:"CdtDbtInd"`
			BookgDt   struct {
				Dt string `xml:"Dt"`
			} `xml:"BookgDt"`
			NtryDtls struct {
				TxDtls struct {
					Refs struct {
						EndToEndId string `xml:"EndToEndId"`
						TxId       string `xml:"TxId"`
					} `xml:"Refs"`
					RltdPties struct {
						Dbtr struct {
							Nm string `xml:"Nm"`
						} `xml:"Dbtr"`
						DbtrAcct struct {
							Id struct {
								Othr struct {
									Id string `xml:"Id"`
								} `xml:"Othr"`
							} `xml:"Id"`
						} `xml:"DbtrAcct"`
						DbtrAgt struct {
							FinInstnId struct {
								Nm string `xml:"Nm"`
							} `xml:"FinInstnId"`
						} `xml:"DbtrAgt"`
					} `xml:"RltdPties"`
					RmtInf struct {
						Ustrd string `xml:"Ustrd"`
					} `xml:"RmtInf"`
				} `xml:"TxDtls"`
			} `xml:"NtryDtls"`
		} `xml:"Ntry"`
	} `xml:"BkToCstmrDbtCdtNtfctn>Ntfctn"`
}

func parseCamt054XML(data []byte) (*CreditAdvice, error) {
	var doc camt054Document
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parsing camt.054 XML: %w", err)
	}

	// Find the first CRDT entry.
	for _, entry := range doc.Ntfctn.Ntry {
		if entry.CdtDbtInd != "CRDT" {
			continue
		}
		amount, err := parseAmount(entry.Amt.Value)
		if err != nil {
			return nil, fmt.Errorf("camt.054 invalid amount %q: %w", entry.Amt.Value, err)
		}
		ccy := entry.Amt.Ccy
		if ccy == "" {
			ccy = "KES"
		}
		valueDate, _ := parseDate(entry.BookgDt.Dt)
		tx := entry.NtryDtls.TxDtls
		msgID := doc.Ntfctn.Id
		if tx.Refs.TxId != "" {
			msgID = tx.Refs.TxId
		}
		return &CreditAdvice{
			MessageID:       msgID,
			Bank:            "ISO20022",
			Amount:          amount,
			Currency:        strings.ToUpper(ccy),
			ValueDate:       valueDate,
			SenderName:      tx.RltdPties.Dbtr.Nm,
			SenderAccount:   tx.RltdPties.DbtrAcct.Id.Othr.Id,
			SenderBank:      tx.RltdPties.DbtrAgt.FinInstnId.Nm,
			Narration:       tx.RmtInf.Ustrd,
			ReferenceNumber: tx.Refs.EndToEndId,
		}, nil
	}
	return nil, fmt.Errorf("camt.054: no CRDT entry found")
}

// ── helpers ──────────────────────────────────────────────────────────────────

func xmlRootElement(data []byte) (string, error) {
	dec := xml.NewDecoder(strings.NewReader(string(data)))
	for {
		tok, err := dec.Token()
		if err != nil {
			return "", err
		}
		if se, ok := tok.(xml.StartElement); ok {
			return se.Name.Local, nil
		}
	}
}

func parseAmount(s string) (float64, error) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", ""))
	return strconv.ParseFloat(s, 64)
}

// parseDate tries several date formats common in Kenyan bank XML messages.
func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	for _, layout := range []string{
		"2006-01-02", "20060102", "2006-01-02T15:04:05",
		"02/01/2006", "01/02/2006",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Now(), fmt.Errorf("unrecognised date format %q", s)
}

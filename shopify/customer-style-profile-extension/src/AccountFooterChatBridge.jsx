/** @jsxImportSource preact */
// @ts-nocheck

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

export default async () => {
  render(<AccountFooterChatBridge />, document.body);
};

function AccountFooterChatBridge() {
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStorefrontUrl() {
      try {
        const response = await shopify.query(
          `query StyledGenieStorefrontBridge {
            shop {
              primaryDomain {
                url
              }
            }
          }`
        );

        const resolvedUrl = String(response?.data?.shop?.primaryDomain?.url || "").trim();
        if (!cancelled) {
          setStorefrontUrl(resolvedUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setStorefrontUrl("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStorefrontUrl();

    return () => {
      cancelled = true;
    };
  }, []);

  const destination = useMemo(() => buildStorefrontChatUrl(storefrontUrl), [storefrontUrl]);

  return (
    <s-box background="base" border="base" borderRadius="large" padding="base">
      <s-stack direction="block" gap="small-200">
        <s-heading>Need StyledGenie on the storefront?</s-heading>
        <s-text>
          Shopify hosts customer account pages separately, so the live storefront stylist opens back on the shop itself.
        </s-text>
        {destination ? (
          <s-button variant="primary" onClick={() => shopify.navigation.navigate(destination)}>
            Open StyledGenie
          </s-button>
        ) : (
          <s-button variant="primary" disabled>
            {loading ? "Preparing storefront link…" : "Storefront link unavailable"}
          </s-button>
        )}
      </s-stack>
    </s-box>
  );
}

function buildStorefrontChatUrl(storefrontUrl) {
  const normalized = String(storefrontUrl || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    url.searchParams.set("styledgenie", "open");
    return url.toString();
  } catch (error) {
    return "";
  }
}

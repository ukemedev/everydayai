import { logger } from "./logger.js";

interface ContactInput {
  name: string;
  email: string;
  phone?: string;
}

interface HubSpotSearchResult {
  results?: Array<{ id?: string }>;
}

export async function upsertHubSpotContact(
  accessToken: string,
  contact: ContactInput
): Promise<{ success: boolean; summary?: string; error?: string }> {
  const nameParts = contact.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? contact.name;
  const lastName  = nameParts.slice(1).join(" ") || "";

  const properties: Record<string, string> = {
    firstname: firstName,
    lastname:  lastName,
    email:     contact.email,
  };
  if (contact.phone) properties.phone = contact.phone;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    const createRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      { method: "POST", headers, body: JSON.stringify({ properties }) }
    );

    if (createRes.ok) {
      const data = (await createRes.json()) as { id?: string };
      logger.info({ contactId: data.id, email: contact.email }, "HubSpot contact created");
      return {
        success: true,
        summary: `Contact "${contact.name}" created in HubSpot (ID: ${data.id ?? "?"})`,
      };
    }

    if (createRes.status === 409) {
      const searchRes = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts/search",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            filterGroups: [{
              filters: [{ propertyName: "email", operator: "EQ", value: contact.email }],
            }],
            properties: ["email", "firstname", "lastname"],
            limit: 1,
          }),
        }
      );

      if (!searchRes.ok) {
        return { success: false, error: `HubSpot search failed: ${searchRes.status}` };
      }

      const searchData = (await searchRes.json()) as HubSpotSearchResult;
      const existingId = searchData.results?.[0]?.id;
      if (!existingId) {
        return { success: false, error: "Contact already exists but could not be located for update." };
      }

      const updateRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`,
        { method: "PATCH", headers, body: JSON.stringify({ properties }) }
      );

      if (updateRes.ok) {
        logger.info({ contactId: existingId, email: contact.email }, "HubSpot contact updated");
        return {
          success: true,
          summary: `Contact "${contact.name}" updated in HubSpot (ID: ${existingId})`,
        };
      }

      const errText = await updateRes.text();
      return { success: false, error: `HubSpot update failed: ${errText.slice(0, 200)}` };
    }

    const errText = await createRes.text();
    logger.error({ status: createRes.status, email: contact.email }, "HubSpot create failed");
    return { success: false, error: `HubSpot error ${createRes.status}: ${errText.slice(0, 200)}` };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, email: contact.email }, "HubSpot upsert threw");
    return { success: false, error: msg };
  }
}

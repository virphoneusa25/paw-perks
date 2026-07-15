import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type ActionData = {
  success?: boolean;
  error?: string;
};

function getBoolean(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function getInteger(
  formData: FormData,
  name: string,
  fallback: number,
  minimum = 0,
): number {
  const rawValue = formData.get(name);
  const parsedValue = Number.parseInt(String(rawValue ?? ""), 10);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(minimum, parsedValue);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.loyaltySettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      programName: "Paw Perks",
      pointsPerSpendCents: 200,
      pointsPerUnit: 1,
      signupBonusPoints: 0,
      birthdayBonusPoints: 0,
      referralBonusPoints: 0,
      excludeTaxes: true,
      excludeShipping: true,
      excludeGiftCards: true,
      allowNegativeBalance: false,
      isEnabled: true,
    },
  });

  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const programName =
    String(formData.get("programName") ?? "").trim() || "Paw Perks";

  const pointsPerSpendCents = getInteger(
    formData,
    "pointsPerSpendCents",
    200,
    1,
  );

  const pointsPerUnit = getInteger(
    formData,
    "pointsPerUnit",
    1,
    1,
  );

  const signupBonusPoints = getInteger(
    formData,
    "signupBonusPoints",
    0,
  );

  const birthdayBonusPoints = getInteger(
    formData,
    "birthdayBonusPoints",
    0,
  );

  const referralBonusPoints = getInteger(
    formData,
    "referralBonusPoints",
    0,
  );

  try {
    await prisma.loyaltySettings.upsert({
      where: { shop },
      update: {
        programName,
        pointsPerSpendCents,
        pointsPerUnit,
        signupBonusPoints,
        birthdayBonusPoints,
        referralBonusPoints,
        excludeTaxes: getBoolean(formData, "excludeTaxes"),
        excludeShipping: getBoolean(formData, "excludeShipping"),
        excludeGiftCards: getBoolean(formData, "excludeGiftCards"),
        allowNegativeBalance: getBoolean(
          formData,
          "allowNegativeBalance",
        ),
        isEnabled: getBoolean(formData, "isEnabled"),
      },
      create: {
        shop,
        programName,
        pointsPerSpendCents,
        pointsPerUnit,
        signupBonusPoints,
        birthdayBonusPoints,
        referralBonusPoints,
        excludeTaxes: getBoolean(formData, "excludeTaxes"),
        excludeShipping: getBoolean(formData, "excludeShipping"),
        excludeGiftCards: getBoolean(formData, "excludeGiftCards"),
        allowNegativeBalance: getBoolean(
          formData,
          "allowNegativeBalance",
        ),
        isEnabled: getBoolean(formData, "isEnabled"),
      },
    });

    return {
      success: true,
    } satisfies ActionData;
  } catch (error) {
    console.error("Failed to update Paw Perks settings:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "The settings could not be saved.",
    } satisfies ActionData;
  }
};

export default function ManageProgramPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";

  const dollarsPerPointUnit = (
    settings.pointsPerSpendCents / 100
  ).toFixed(2);

  return (
    <div className="manage-page">
      <div className="manage-page__header">
        <div>
          <h1>Manage Paw Perks</h1>
          <p>Configure how customers earn and use Paw Points.</p>
        </div>
      </div>

      <style>{`
        .manage-page {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px 20px 48px;
          box-sizing: border-box;
        }

        .manage-page__header {
          margin-bottom: 20px;
        }

        .manage-page__header h1 {
          margin: 0;
          color: #202223;
          font-size: 24px;
          line-height: 1.3;
        }

        .manage-page__header p {
          margin: 6px 0 0;
          color: #616161;
          font-size: 14px;
        }

        .manage-program {
          display: grid;
          gap: 20px;
          padding-bottom: 32px;
        }

        .settings-card {
          background: #ffffff;
          border: 1px solid #dfe3e8;
          border-radius: 14px;
          padding: 22px;
          box-shadow: 0 1px 2px rgba(31, 33, 36, 0.08);
        }

        .settings-card h2 {
          margin: 0 0 6px;
          font-size: 18px;
          line-height: 1.35;
        }

        .settings-card p {
          margin: 0 0 20px;
          color: #616161;
          line-height: 1.5;
        }

        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .field-grid--three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .field {
          display: grid;
          gap: 7px;
        }

        .field label {
          font-weight: 600;
        }

        .field input[type="text"],
        .field input[type="number"] {
          width: 100%;
          box-sizing: border-box;
          min-height: 42px;
          padding: 9px 12px;
          border: 1px solid #8a8a8a;
          border-radius: 8px;
          background: #ffffff;
          color: #202223;
          font: inherit;
        }

        .field input:focus {
          outline: 2px solid #005bd3;
          outline-offset: 1px;
        }

        .field-help {
          color: #616161;
          font-size: 13px;
          line-height: 1.4;
        }

        .checkbox-list {
          display: grid;
          gap: 14px;
        }

        .checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .checkbox-row input {
          width: 18px;
          height: 18px;
          margin-top: 2px;
        }

        .checkbox-copy {
          display: grid;
          gap: 3px;
        }

        .checkbox-copy strong {
          font-weight: 600;
        }

        .checkbox-copy span {
          color: #616161;
          font-size: 13px;
        }

        .earning-preview {
          margin-top: 18px;
          padding: 14px 16px;
          border-radius: 10px;
          background: #f1f8f5;
          border: 1px solid #b7e4d2;
        }

        .save-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          position: sticky;
          bottom: 0;
          padding: 14px 18px;
          background: #ffffff;
          border: 1px solid #dfe3e8;
          border-radius: 12px;
          box-shadow: 0 -3px 14px rgba(0, 0, 0, 0.08);
        }

        .save-button {
          border: 0;
          border-radius: 8px;
          padding: 10px 18px;
          background: #303030;
          color: #ffffff;
          font: inherit;
          font-weight: 650;
          cursor: pointer;
        }

        .save-button:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .notice {
          padding: 12px 14px;
          border-radius: 9px;
        }

        .notice--success {
          background: #eaf8f2;
          border: 1px solid #8fd5bb;
          color: #145c43;
        }

        .notice--error {
          background: #fff1f0;
          border: 1px solid #e6a3a0;
          color: #8e1f18;
        }

        @media (max-width: 760px) {
          .field-grid,
          .field-grid--three {
            grid-template-columns: 1fr;
          }

          .save-bar {
            align-items: stretch;
            flex-direction: column;
          }

          .save-button {
            width: 100%;
          }
        }
      `}</style>

      <Form method="post" className="manage-program">
        {actionData?.success ? (
          <div className="notice notice--success">
            Paw Perks settings were saved successfully.
          </div>
        ) : null}

        {actionData?.error ? (
          <div className="notice notice--error">
            {actionData.error}
          </div>
        ) : null}

        <section className="settings-card">
          <h2>Program status</h2>
          <p>
            Control whether customers can earn and redeem Paw
            Points.
          </p>

          <div className="checkbox-row">
            <input
              id="isEnabled"
              name="isEnabled"
              type="checkbox"
              defaultChecked={settings.isEnabled}
            />

            <label className="checkbox-copy" htmlFor="isEnabled">
              <strong>Program active</strong>
              <span>
                Turning this off pauses new point awards without
                deleting existing balances.
              </span>
            </label>
          </div>
        </section>

        <section className="settings-card">
          <h2>Program identity</h2>
          <p>
            Set the customer-facing name of your loyalty program.
          </p>

          <div className="field">
            <label htmlFor="programName">Program name</label>

            <input
              id="programName"
              name="programName"
              type="text"
              maxLength={80}
              defaultValue={settings.programName}
              required
            />

            <span className="field-help">
              Example: Paw Perks
            </span>
          </div>
        </section>

        <section className="settings-card">
          <h2>Earning rate</h2>
          <p>
            Configure how many Paw Points customers earn from
            eligible merchandise.
          </p>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="pointsPerSpendCents">
                Spend required, in cents
              </label>

              <input
                id="pointsPerSpendCents"
                name="pointsPerSpendCents"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.pointsPerSpendCents}
                required
              />

              <span className="field-help">
                Enter 200 for $2.00.
              </span>
            </div>

            <div className="field">
              <label htmlFor="pointsPerUnit">
                Points awarded
              </label>

              <input
                id="pointsPerUnit"
                name="pointsPerUnit"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.pointsPerUnit}
                required
              />

              <span className="field-help">
                Number of points awarded for each spend unit.
              </span>
            </div>
          </div>

          <div className="earning-preview">
            Current rule: earn{" "}
            <strong>{settings.pointsPerUnit}</strong>{" "}
            {settings.pointsPerUnit === 1 ? "point" : "points"} for
            every <strong>${dollarsPerPointUnit}</strong> spent.
          </div>
        </section>

        <section className="settings-card">
          <h2>Bonus points</h2>
          <p>
            Set automatic bonus amounts. We will wire the triggering
            events after the program-management screens are complete.
          </p>

          <div className="field-grid field-grid--three">
            <div className="field">
              <label htmlFor="signupBonusPoints">
                Signup bonus
              </label>

              <input
                id="signupBonusPoints"
                name="signupBonusPoints"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.signupBonusPoints}
              />
            </div>

            <div className="field">
              <label htmlFor="birthdayBonusPoints">
                Birthday bonus
              </label>

              <input
                id="birthdayBonusPoints"
                name="birthdayBonusPoints"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.birthdayBonusPoints}
              />
            </div>

            <div className="field">
              <label htmlFor="referralBonusPoints">
                Referral bonus
              </label>

              <input
                id="referralBonusPoints"
                name="referralBonusPoints"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.referralBonusPoints}
              />
            </div>
          </div>
        </section>

        <section className="settings-card">
          <h2>Point calculation</h2>
          <p>
            Choose which order amounts are excluded from Paw Point
            calculations.
          </p>

          <div className="checkbox-list">
            <div className="checkbox-row">
              <input
                id="excludeTaxes"
                name="excludeTaxes"
                type="checkbox"
                defaultChecked={settings.excludeTaxes}
              />

              <label
                className="checkbox-copy"
                htmlFor="excludeTaxes"
              >
                <strong>Exclude taxes</strong>
                <span>
                  Customers do not earn points on sales tax.
                </span>
              </label>
            </div>

            <div className="checkbox-row">
              <input
                id="excludeShipping"
                name="excludeShipping"
                type="checkbox"
                defaultChecked={settings.excludeShipping}
              />

              <label
                className="checkbox-copy"
                htmlFor="excludeShipping"
              >
                <strong>Exclude shipping</strong>
                <span>
                  Customers do not earn points on shipping charges.
                </span>
              </label>
            </div>

            <div className="checkbox-row">
              <input
                id="excludeGiftCards"
                name="excludeGiftCards"
                type="checkbox"
                defaultChecked={settings.excludeGiftCards}
              />

              <label
                className="checkbox-copy"
                htmlFor="excludeGiftCards"
              >
                <strong>Exclude gift cards</strong>
                <span>
                  Gift-card products do not generate Paw Points.
                </span>
              </label>
            </div>

            <div className="checkbox-row">
              <input
                id="allowNegativeBalance"
                name="allowNegativeBalance"
                type="checkbox"
                defaultChecked={settings.allowNegativeBalance}
              />

              <label
                className="checkbox-copy"
                htmlFor="allowNegativeBalance"
              >
                <strong>Allow negative balances</strong>
                <span>
                  Refund reversals may reduce a customer below zero.
                </span>
              </label>
            </div>
          </div>
        </section>

        <div className="save-bar">
          <span>
            Changes affect future point awards and refund
            calculations.
          </span>

          <button
            className="save-button"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save program"}
          </button>
        </div>
      </Form>
    </div>
  );
}
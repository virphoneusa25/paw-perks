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

function parseInteger(
  formData: FormData,
  field: string,
  fallback: number,
  minimum = 0,
): number {
  const value = Number.parseInt(
    String(formData.get(field) ?? ""),
    10,
  );

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, value);
}

function parseOptionalInteger(
  formData: FormData,
  field: string,
  minimum = 0,
): number | null {
  const rawValue = String(formData.get(field) ?? "").trim();

  if (!rawValue) {
    return null;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(minimum, value);
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const rewards = await prisma.rewardDefinition.findMany({
    where: { shop },
    orderBy: [
      { sortOrder: "asc" },
      { pointsRequired: "asc" },
      { createdAt: "asc" },
    ],
    include: {
      _count: {
        select: {
          redemptions: true,
        },
      },
    },
  });

  return { rewards };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "create") {
      const name = String(formData.get("name") ?? "").trim();
      const description =
        String(formData.get("description") ?? "").trim() || null;

      const requestedKey = String(formData.get("key") ?? "");
      const key = normalizeKey(requestedKey || name);

      const discountType = String(
        formData.get("discountType") ?? "FIXED_AMOUNT",
      );

      if (!name) {
        return {
          success: false,
          error: "Reward name is required.",
        } satisfies ActionData;
      }

      if (!key) {
        return {
          success: false,
          error: "Reward key could not be generated.",
        } satisfies ActionData;
      }

      if (
        discountType !== "FIXED_AMOUNT" &&
        discountType !== "PERCENTAGE"
      ) {
        return {
          success: false,
          error: "Invalid discount type.",
        } satisfies ActionData;
      }

      const existingReward =
        await prisma.rewardDefinition.findUnique({
          where: {
            shop_key: {
              shop,
              key,
            },
          },
        });

      if (existingReward) {
        return {
          success: false,
          error:
            "A reward with this key already exists. Use a different key.",
        } satisfies ActionData;
      }

      await prisma.rewardDefinition.create({
        data: {
          shop,
          key,
          name,
          description,
          pointsRequired: parseInteger(
            formData,
            "pointsRequired",
            100,
            1,
          ),
          discountType,
          discountValue: parseInteger(
            formData,
            "discountValue",
            500,
            1,
          ),
          minimumSpend: parseOptionalInteger(
            formData,
            "minimumSpend",
            0,
          ),
          expiresInDays: parseOptionalInteger(
            formData,
            "expiresInDays",
            1,
          ),
          isActive: formData.get("isActive") === "on",
          sortOrder: parseInteger(
            formData,
            "sortOrder",
            0,
            0,
          ),
        },
      });

      return {
        success: true,
      } satisfies ActionData;
    }

    if (intent === "update") {
      const rewardId = String(formData.get("rewardId") ?? "");

      const existingReward =
        await prisma.rewardDefinition.findFirst({
          where: {
            id: rewardId,
            shop,
          },
        });

      if (!existingReward) {
        return {
          success: false,
          error: "Reward not found.",
        } satisfies ActionData;
      }

      const name =
        String(formData.get("name") ?? "").trim() ||
        existingReward.name;

      const description =
        String(formData.get("description") ?? "").trim() || null;

      const requestedKey = String(formData.get("key") ?? "");
      const key = normalizeKey(
        requestedKey || existingReward.key || name,
      );

      const discountType = String(
        formData.get("discountType") ??
          existingReward.discountType,
      );

      if (
        discountType !== "FIXED_AMOUNT" &&
        discountType !== "PERCENTAGE"
      ) {
        return {
          success: false,
          error: "Invalid discount type.",
        } satisfies ActionData;
      }

      const conflictingReward =
        await prisma.rewardDefinition.findFirst({
          where: {
            shop,
            key,
            NOT: {
              id: rewardId,
            },
          },
        });

      if (conflictingReward) {
        return {
          success: false,
          error:
            "Another reward already uses this key.",
        } satisfies ActionData;
      }

      await prisma.rewardDefinition.update({
        where: {
          id: rewardId,
        },
        data: {
          key,
          name,
          description,
          pointsRequired: parseInteger(
            formData,
            "pointsRequired",
            existingReward.pointsRequired,
            1,
          ),
          discountType,
          discountValue: parseInteger(
            formData,
            "discountValue",
            existingReward.discountValue,
            1,
          ),
          minimumSpend: parseOptionalInteger(
            formData,
            "minimumSpend",
            0,
          ),
          expiresInDays: parseOptionalInteger(
            formData,
            "expiresInDays",
            1,
          ),
          isActive: formData.get("isActive") === "on",
          sortOrder: parseInteger(
            formData,
            "sortOrder",
            existingReward.sortOrder,
            0,
          ),
        },
      });

      return {
        success: true,
      } satisfies ActionData;
    }

    if (intent === "toggle") {
      const rewardId = String(formData.get("rewardId") ?? "");

      const reward = await prisma.rewardDefinition.findFirst({
        where: {
          id: rewardId,
          shop,
        },
      });

      if (!reward) {
        return {
          success: false,
          error: "Reward not found.",
        } satisfies ActionData;
      }

      await prisma.rewardDefinition.update({
        where: {
          id: reward.id,
        },
        data: {
          isActive: !reward.isActive,
        },
      });

      return {
        success: true,
      } satisfies ActionData;
    }

    if (intent === "delete") {
      const rewardId = String(formData.get("rewardId") ?? "");

      const reward = await prisma.rewardDefinition.findFirst({
        where: {
          id: rewardId,
          shop,
        },
        include: {
          _count: {
            select: {
              redemptions: true,
            },
          },
        },
      });

      if (!reward) {
        return {
          success: false,
          error: "Reward not found.",
        } satisfies ActionData;
      }

      if (reward._count.redemptions > 0) {
        return {
          success: false,
          error:
            "This reward has redemption history and cannot be deleted. Deactivate it instead.",
        } satisfies ActionData;
      }

      await prisma.rewardDefinition.delete({
        where: {
          id: reward.id,
        },
      });

      return {
        success: true,
      } satisfies ActionData;
    }

    return {
      success: false,
      error: "Unknown reward action.",
    } satisfies ActionData;
  } catch (error) {
    console.error("Paw Perks reward action failed:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "The reward action could not be completed.",
    } satisfies ActionData;
  }
};

function formatDiscount(
  discountType: string,
  discountValue: number,
): string {
  if (discountType === "PERCENTAGE") {
    return `${discountValue}% off`;
  }

  return `$${(discountValue / 100).toFixed(2)} off`;
}

export default function RewardsPage() {
  const { rewards } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="rewards-page">
      <style>{`
        .rewards-page {
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
          padding: 24px 20px 48px;
          box-sizing: border-box;
          color: #202223;
        }

        .rewards-header {
          margin-bottom: 20px;
        }

        .rewards-header h1 {
          margin: 0;
          font-size: 24px;
          line-height: 1.3;
        }

        .rewards-header p {
          margin: 6px 0 0;
          color: #616161;
        }

        .notice {
          margin-bottom: 18px;
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

        .reward-card {
          background: #ffffff;
          border: 1px solid #dfe3e8;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 18px;
          box-shadow: 0 1px 2px rgba(31, 33, 36, 0.08);
        }

        .reward-card h2,
        .reward-card h3 {
          margin: 0;
        }

        .reward-card__intro {
          margin: 6px 0 18px;
          color: #616161;
        }

        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .field-grid--three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .field {
          display: grid;
          gap: 7px;
        }

        .field--full {
          grid-column: 1 / -1;
        }

        .field label {
          font-weight: 600;
        }

        .field input,
        .field select,
        .field textarea {
          width: 100%;
          box-sizing: border-box;
          min-height: 42px;
          padding: 9px 11px;
          border: 1px solid #8a8a8a;
          border-radius: 8px;
          background: #ffffff;
          color: #202223;
          font: inherit;
        }

        .field textarea {
          min-height: 84px;
          resize: vertical;
        }

        .field-help {
          color: #616161;
          font-size: 13px;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 16px;
        }

        .checkbox-row input {
          width: 18px;
          height: 18px;
        }

        .button-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }

        .button {
          border: 1px solid #8a8a8a;
          border-radius: 8px;
          padding: 9px 15px;
          background: #ffffff;
          color: #202223;
          font: inherit;
          font-weight: 650;
          cursor: pointer;
        }

        .button--primary {
          border-color: #303030;
          background: #303030;
          color: #ffffff;
        }

        .button--danger {
          border-color: #d72c0d;
          color: #b42318;
        }

        .button:disabled {
          cursor: wait;
          opacity: 0.6;
        }

        .reward-list {
          display: grid;
          gap: 16px;
        }

        .reward-item {
          border: 1px solid #dfe3e8;
          border-radius: 12px;
          padding: 18px;
        }

        .reward-item__top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 16px;
        }

        .reward-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 3px 9px;
          border-radius: 999px;
          background: #f1f1f1;
          font-size: 13px;
        }

        .badge--active {
          background: #eaf8f2;
          color: #145c43;
        }

        .badge--inactive {
          background: #f4f4f4;
          color: #616161;
        }

        .empty-state {
          padding: 36px 18px;
          border: 1px dashed #b7b7b7;
          border-radius: 12px;
          text-align: center;
          color: #616161;
        }

        details summary {
          cursor: pointer;
          font-weight: 650;
          margin-bottom: 14px;
        }

        @media (max-width: 760px) {
          .field-grid,
          .field-grid--three {
            grid-template-columns: 1fr;
          }

          .reward-item__top {
            flex-direction: column;
          }

          .button-row {
            flex-direction: column;
          }

          .button {
            width: 100%;
          }
        }
      `}</style>

      <header className="rewards-header">
        <h1>Rewards</h1>
        <p>
          Create the rewards customers can redeem with Paw Points.
        </p>
      </header>

      {actionData?.success ? (
        <div className="notice notice--success">
          Reward changes were saved successfully.
        </div>
      ) : null}

      {actionData?.error ? (
        <div className="notice notice--error">
          {actionData.error}
        </div>
      ) : null}

      <section className="reward-card">
        <h2>Create reward</h2>
        <p className="reward-card__intro">
          Fixed rewards use cents. Percentage rewards use a whole
          percentage number.
        </p>

        <Form method="post">
          <input type="hidden" name="intent" value="create" />

          <div className="field-grid">
            <div className="field">
              <label htmlFor="create-name">Reward name</label>
              <input
                id="create-name"
                name="name"
                type="text"
                placeholder="$5 Paw Perks Reward"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="create-key">Internal key</label>
              <input
                id="create-key"
                name="key"
                type="text"
                placeholder="five-dollar-reward"
              />
              <span className="field-help">
                Leave blank to generate it from the reward name.
              </span>
            </div>

            <div className="field field--full">
              <label htmlFor="create-description">
                Description
              </label>
              <textarea
                id="create-description"
                name="description"
                placeholder="Save $5 on a future PawMart purchase."
              />
            </div>

            <div className="field">
              <label htmlFor="create-points">
                Points required
              </label>
              <input
                id="create-points"
                name="pointsRequired"
                type="number"
                min="1"
                step="1"
                defaultValue="100"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="create-discount-type">
                Discount type
              </label>
              <select
                id="create-discount-type"
                name="discountType"
                defaultValue="FIXED_AMOUNT"
              >
                <option value="FIXED_AMOUNT">
                  Fixed dollar amount
                </option>
                <option value="PERCENTAGE">
                  Percentage
                </option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="create-discount-value">
                Discount value
              </label>
              <input
                id="create-discount-value"
                name="discountValue"
                type="number"
                min="1"
                step="1"
                defaultValue="500"
                required
              />
              <span className="field-help">
                Enter 500 for $5.00, or 10 for 10%.
              </span>
            </div>

            <div className="field">
              <label htmlFor="create-minimum-spend">
                Minimum spend, in cents
              </label>
              <input
                id="create-minimum-spend"
                name="minimumSpend"
                type="number"
                min="0"
                step="1"
                placeholder="Optional"
              />
            </div>

            <div className="field">
              <label htmlFor="create-expiration">
                Expires after days
              </label>
              <input
                id="create-expiration"
                name="expiresInDays"
                type="number"
                min="1"
                step="1"
                placeholder="Optional"
              />
            </div>

            <div className="field">
              <label htmlFor="create-sort-order">
                Sort order
              </label>
              <input
                id="create-sort-order"
                name="sortOrder"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
            </div>
          </div>

          <label className="checkbox-row">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked
            />
            <span>Reward active</span>
          </label>

          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving…" : "Create reward"}
            </button>
          </div>
        </Form>
      </section>

      <section className="reward-card">
        <h2>Existing rewards</h2>
        <p className="reward-card__intro">
          Rewards with redemption history may be deactivated but are
          not deleted.
        </p>

        {rewards.length === 0 ? (
          <div className="empty-state">
            No rewards have been created yet.
          </div>
        ) : (
          <div className="reward-list">
            {rewards.map((reward) => (
              <article className="reward-item" key={reward.id}>
                <div className="reward-item__top">
                  <div>
                    <h3>{reward.name}</h3>

                    <div className="reward-summary">
                      <span
                        className={
                          reward.isActive
                            ? "badge badge--active"
                            : "badge badge--inactive"
                        }
                      >
                        {reward.isActive ? "Active" : "Inactive"}
                      </span>

                      <span className="badge">
                        {reward.pointsRequired} points
                      </span>

                      <span className="badge">
                        {formatDiscount(
                          reward.discountType,
                          reward.discountValue,
                        )}
                      </span>

                      <span className="badge">
                        {reward._count.redemptions} redemptions
                      </span>
                    </div>
                  </div>

                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="toggle"
                    />
                    <input
                      type="hidden"
                      name="rewardId"
                      value={reward.id}
                    />

                    <button className="button" type="submit">
                      {reward.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </Form>
                </div>

                <details>
                  <summary>Edit reward</summary>

                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="update"
                    />
                    <input
                      type="hidden"
                      name="rewardId"
                      value={reward.id}
                    />

                    <div className="field-grid">
                      <div className="field">
                        <label>Name</label>
                        <input
                          name="name"
                          type="text"
                          defaultValue={reward.name}
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Internal key</label>
                        <input
                          name="key"
                          type="text"
                          defaultValue={reward.key}
                          required
                        />
                      </div>

                      <div className="field field--full">
                        <label>Description</label>
                        <textarea
                          name="description"
                          defaultValue={
                            reward.description ?? ""
                          }
                        />
                      </div>

                      <div className="field">
                        <label>Points required</label>
                        <input
                          name="pointsRequired"
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={reward.pointsRequired}
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Discount type</label>
                        <select
                          name="discountType"
                          defaultValue={reward.discountType}
                        >
                          <option value="FIXED_AMOUNT">
                            Fixed dollar amount
                          </option>
                          <option value="PERCENTAGE">
                            Percentage
                          </option>
                        </select>
                      </div>

                      <div className="field">
                        <label>Discount value</label>
                        <input
                          name="discountValue"
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={reward.discountValue}
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Minimum spend, in cents</label>
                        <input
                          name="minimumSpend"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            reward.minimumSpend ?? ""
                          }
                        />
                      </div>

                      <div className="field">
                        <label>Expires after days</label>
                        <input
                          name="expiresInDays"
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={
                            reward.expiresInDays ?? ""
                          }
                        />
                      </div>

                      <div className="field">
                        <label>Sort order</label>
                        <input
                          name="sortOrder"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={reward.sortOrder}
                        />
                      </div>
                    </div>

                    <label className="checkbox-row">
                      <input
                        name="isActive"
                        type="checkbox"
                        defaultChecked={reward.isActive}
                      />
                      <span>Reward active</span>
                    </label>

                    <div className="button-row">
                      <button
                        className="button button--primary"
                        type="submit"
                      >
                        Save reward
                      </button>
                    </div>
                  </Form>
                </details>

                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="delete"
                  />
                  <input
                    type="hidden"
                    name="rewardId"
                    value={reward.id}
                  />

                  <button
                    className="button button--danger"
                    type="submit"
                    disabled={reward._count.redemptions > 0}
                  >
                    Delete reward
                  </button>
                </Form>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
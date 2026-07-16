type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type UserError = {
  field?: string[] | null;
  message: string;
};

type AddressInput = {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  provinceCode?: string;
  countryCode: string;
  zip: string;
  phone?: string;
};

function cleanAddress(
  address: AddressInput,
): Record<string, string> {
  const result: Record<string, string> = {
    address1: address.address1,
    city: address.city,
    countryCode: address.countryCode.toUpperCase(),
    zip: address.zip,
  };

  const optionalFields: Array<
    keyof Omit<
      AddressInput,
      "address1" | "city" | "countryCode" | "zip"
    >
  > = [
    "firstName",
    "lastName",
    "company",
    "address2",
    "provinceCode",
    "phone",
  ];

  for (const field of optionalFields) {
    const value = address[field]?.trim();

    if (value) {
      result[field] = value;
    }
  }

  return result;
}

function assertNoUserErrors(
  userErrors: UserError[] | undefined,
): void {
  if (!userErrors?.length) {
    return;
  }

  throw new Error(
    userErrors
      .map((error) => error.message)
      .join(" "),
  );
}

export async function updateCustomerProfile({
  admin,
  customerId,
  firstName,
  lastName,
  email,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<void> {
  const response = await admin.graphql(
    `#graphql
      mutation PawPerksUpdateCustomer(
        $input: CustomerInput!
      ) {
        customerUpdate(input: $input) {
          customer {
            id
            firstName
            lastName
            email
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: {
          id: customerId,
          firstName,
          lastName,
          email,
        },
      },
    },
  );

  const result = (await response.json()) as {
    data?: {
      customerUpdate?: {
        userErrors?: UserError[];
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(
      result.errors.map((error) => error.message).join(" "),
    );
  }

  assertNoUserErrors(
    result.data?.customerUpdate?.userErrors,
  );
}

export async function createCustomerAddress({
  admin,
  customerId,
  address,
  setAsDefault,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  address: AddressInput;
  setAsDefault: boolean;
}): Promise<void> {
  const response = await admin.graphql(
    `#graphql
      mutation PawPerksCreateAddress(
        $customerId: ID!
        $address: MailingAddressInput!
        $setAsDefault: Boolean
      ) {
        customerAddressCreate(
          customerId: $customerId
          address: $address
          setAsDefault: $setAsDefault
        ) {
          address {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        customerId,
        address: cleanAddress(address),
        setAsDefault,
      },
    },
  );

  const result = (await response.json()) as {
    data?: {
      customerAddressCreate?: {
        userErrors?: UserError[];
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(
      result.errors.map((error) => error.message).join(" "),
    );
  }

  assertNoUserErrors(
    result.data?.customerAddressCreate?.userErrors,
  );
}

export async function updateCustomerAddress({
  admin,
  customerId,
  addressId,
  address,
  setAsDefault,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  addressId: string;
  address: AddressInput;
  setAsDefault: boolean;
}): Promise<void> {
  const response = await admin.graphql(
    `#graphql
      mutation PawPerksUpdateAddress(
        $customerId: ID!
        $addressId: ID!
        $address: MailingAddressInput!
        $setAsDefault: Boolean
      ) {
        customerAddressUpdate(
          customerId: $customerId
          addressId: $addressId
          address: $address
          setAsDefault: $setAsDefault
        ) {
          address {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        customerId,
        addressId,
        address: cleanAddress(address),
        setAsDefault,
      },
    },
  );

  const result = (await response.json()) as {
    data?: {
      customerAddressUpdate?: {
        userErrors?: UserError[];
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(
      result.errors.map((error) => error.message).join(" "),
    );
  }

  assertNoUserErrors(
    result.data?.customerAddressUpdate?.userErrors,
  );
}

export async function deleteCustomerAddress({
  admin,
  customerId,
  addressId,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  addressId: string;
}): Promise<void> {
  const response = await admin.graphql(
    `#graphql
      mutation PawPerksDeleteAddress(
        $customerId: ID!
        $addressId: ID!
      ) {
        customerAddressDelete(
          customerId: $customerId
          addressId: $addressId
        ) {
          deletedAddressId
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        customerId,
        addressId,
      },
    },
  );

  const result = (await response.json()) as {
    data?: {
      customerAddressDelete?: {
        userErrors?: UserError[];
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(
      result.errors.map((error) => error.message).join(" "),
    );
  }

  assertNoUserErrors(
    result.data?.customerAddressDelete?.userErrors,
  );
}

export async function setDefaultCustomerAddress({
  admin,
  customerId,
  addressId,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  addressId: string;
}): Promise<void> {
  const response = await admin.graphql(
    `#graphql
      mutation PawPerksSetDefaultAddress(
        $customerId: ID!
        $addressId: ID!
      ) {
        customerUpdateDefaultAddress(
          customerId: $customerId
          addressId: $addressId
        ) {
          customer {
            id
            defaultAddress {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        customerId,
        addressId,
      },
    },
  );

  const result = (await response.json()) as {
    data?: {
      customerUpdateDefaultAddress?: {
        userErrors?: UserError[];
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(
      result.errors.map((error) => error.message).join(" "),
    );
  }

  assertNoUserErrors(
    result.data?.customerUpdateDefaultAddress
      ?.userErrors,
  );
}
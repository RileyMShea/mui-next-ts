import { createModel } from '@xstate/test';
import faker from 'faker';
import isEmpty from 'validator/lib/isEmpty';
import isLength from 'validator/lib/isLength';
import { createMachine } from 'xstate';

type TypeUsernameEvent = {
  type: string;
  username: string;
};
type TypePasswordEvent = {
  type: string;
  password: string;
};
type FillEvent = TypeUsernameEvent & TypePasswordEvent;
function isValidUsername(username: string): boolean {
  return (
    !isEmpty(username, { ignore_whitespace: true }) &&
    isLength(username, { min: 5 })
  );
}
function isValidPassword(password: string): boolean {
  return (
    !isEmpty(password, { ignore_whitespace: true }) &&
    isLength(password, { min: 8 })
  );
}
function isValidLogin({ username, password }: FillEvent): boolean {
  return isValidUsername(username) && isValidPassword(password);
}
function areValidCredentials({ username, password }: FillEvent): boolean {
  return username === 'admin' && password === 'Pa$$w0rd!';
}
const usernameLabel = /Username/i;
const passwordLabel = /Password/i;
const submitButton = /Log me in/i;
const failMachine = createMachine<never, FillEvent>({
  id: 'login-fail-test',
  initial: 'pristine',
  states: {
    pristine: {
      on: {
        FILL_FORM: [
          {
            target: 'invalid.username',
            cond: (_, event) => !isValidUsername(event.username),
          },
          {
            target: 'invalid.password',
            cond: (_, event) => !isValidPassword(event.password),
          },
          {
            target: 'correctCredentials',
            cond: (_, event) => areValidCredentials(event),
          },
          {
            target: 'valid',
            cond: (_, event) => isValidLogin(event),
          },
        ],
      },
      meta: {
        test(cy: Cypress.cy) {
          cy.findByLabelText('sad face').should('not.be.visible');
        },
      },
    },
    invalid: {
      states: {
        username: {
          meta: {
            test(cy: Cypress.cy) {
              cy.findByText(/Username.+(?:empty|too short)/).should('exist');
            },
          },
        },
        password: {
          meta: {
            test(cy: Cypress.cy) {
              cy.findByText(/Password.+(?:empty|too short)/).should('exist');
            },
          },
        },
      },
    },
    valid: {
      on: {
        SUBMIT: { target: 'incorrectCredentials' },
      },
      meta: {
        test(cy: Cypress.cy) {
          cy.findByText(/Username.+(?:empty|too short)/).should('not.exist');
          cy.findByText(/Password.+(?:empty|too short)/).should('not.exist');
        },
      },
    },
    correctCredentials: {
      on: {
        SUBMIT: { target: 'success' },
      },
    },
    incorrectCredentials: {
      on: {
        RETRY: { target: 'retry' },
      },
      meta: {
        test(cy: Cypress.cy) {
          cy.findByText(/Wrong (?:username|password)/i).should('exist');
        },
      },
    },
    success: {
      type: 'final',
      meta: {
        test(cy: Cypress.cy) {
          cy.waitUntil(() =>
            cy.location('pathname').then(pathname => pathname !== '/login'),
          )
            .location('pathname')
            .should('equal', '/');
        },
      },
    },
    retry: {
      on: {
        SUBMIT: { target: 'locked' },
      },
    },
    locked: {
      type: 'final',
      meta: {
        test(cy: Cypress.cy) {
          cy.findByText(/Too many failed attempts/i).should('exist');
          cy.findByLabelText(usernameLabel).should('be.disabled');
          cy.findByLabelText(passwordLabel).should('be.disabled');
          cy.findByText(submitButton).parent().should('be.disabled');
        },
      },
    },
  },
});
const testModel = createModel(failMachine, {
  events: {
    FILL_FORM: {
      exec(cy: Cypress.cy, event: FillEvent) {
        cy.findByLabelText(usernameLabel).clear().type(event.username);
        cy.findByLabelText(passwordLabel).clear().type(event.password);
      },
      cases: [
        { username: 'user', password: faker.internet.password(7) },
        { username: 'user', password: faker.internet.password(12, true) },
        { username: 'admin', password: faker.internet.password() },
        {
          username: faker.lorem.word(),
          password: faker.internet.password(7),
        },
        {
          username: faker.internet.userName(),
          password: faker.internet.password(),
        },
        { username: 'admin', password: 'Pa$$w0rd!' },
      ],
    },
    SUBMIT(cy: Cypress.cy) {
      cy.findByText(submitButton)
        .click()
        .wait('@sendLogin')
        .its('status')
        .should('satisfy', status => [200, 401].includes(status));
    },
    RETRY(cy: Cypress.cy) {
      cy.findByLabelText(passwordLabel)
        .clear()
        .type(faker.internet.password(12, true));
      cy.findByText(submitButton).click().wait('@sendLogin');

      cy.findByLabelText(passwordLabel)
        .clear()
        .type(faker.internet.password(18));
      cy.findByText(submitButton).click().wait('@sendLogin');

      cy.findByLabelText(passwordLabel)
        .clear()
        .type(faker.internet.password(14, true));
    },
  },
});

describe('Login page', () => {
  const testPlans = testModel.getSimplePathPlans();

  testPlans.forEach(plan => {
    describe(plan.description, () => {
      plan.paths.forEach(path => {
        it(path.description, () =>
          cy
            .server()
            .route('POST', '/api/auth/login')
            .as('sendLogin')
            .visit('/login')
            .then(() => path.test(cy)),
        );
      });
    });
  });

  // it('coverage', () => {
  //   testModel.testCoverage();
  // });

  it('should go to register', () => {
    cy.server()
      .route('POST', '/api/auth/login')
      .as('sendLogin')
      .visit('/login');

    cy.findByText(/Register/i).click();

    cy.waitUntil(() =>
      cy.location('pathname').then(pathname => pathname !== '/login'),
    )
      .location('pathname')
      .should('equal', '/register');
  });
});

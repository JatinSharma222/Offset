import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';

const httpUri = import.meta.env.VITE_GRAPHQL_HTTP || 'http://localhost:8080/graphql';
const wsUri = import.meta.env.VITE_GRAPHQL_WS || 'ws://localhost:8080/graphql/ws';

const httpLink = new HttpLink({
  uri: httpUri,
});

const wsLink = typeof window !== 'undefined'
  ? new GraphQLWsLink(
      createClient({
        url: wsUri,
        lazy: true,
        retryAttempts: 5,
      })
    )
  : null;

const splitLink = wsLink
  ? split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      httpLink
    )
  : httpLink;

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});

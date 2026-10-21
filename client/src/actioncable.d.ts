declare module "@rails/actioncable" {
  export interface Subscription {
    unsubscribe(): void;
    perform(action: string, data?: any): void;
  }
  export interface Consumer {
    subscriptions: {
      create(params: any, handlers: any): Subscription;
    };
  }
  export function createConsumer(url?: string): Consumer;
}

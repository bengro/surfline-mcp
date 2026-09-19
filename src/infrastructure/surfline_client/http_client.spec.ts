import { Impit, ImpitResponse, RequestInit } from 'impit';
import { SurflineHttpClient } from './http_client';

const asImpitResponse = (r: Response) => r as unknown as ImpitResponse;

type Call = { url: string; init: RequestInit };

function stubFetch(): Call[] {
  const calls: Call[] = [];
  jest
    .spyOn(Impit.prototype, 'fetch')
    .mockImplementation(async (resource, init: RequestInit = {}) => {
      const url = String(resource);
      calls.push({ url, init });
      const body = url.includes('/trusted/token')
        ? { access_token: 'test-access-token' }
        : { data: { surf: [] } };
      return asImpitResponse(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    });
  return calls;
}

describe('Surfline HTTP authentication', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the current web login contract and authenticates forecast requests', async () => {
    const calls = stubFetch();
    const client = new SurflineHttpClient();
    const email = 'surfer+test@example.com';
    const password = 'test & pass=word+!';

    await client.login(email, password);
    await client.getSurf('test-spot', 7, 1);

    const [login, forecast] = calls;

    expect(login.url).toBe(
      'https://services.surfline.com/trusted/token?isShortLived=false',
    );
    expect(login.init.method).toBe('POST');
    expect((login.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(
      Object.fromEntries(new URLSearchParams(login.init.body as string)),
    ).toEqual({
      grant_type: 'password',
      username: email,
      password,
      forced: 'true',
      device_id: '',
      device_type: '',
      client_id: '5c59e7c3f0b6cb1ad02baf66',
    });

    expect(
      (forecast.init.headers as Record<string, string>)['Authorization'],
    ).toBe('Bearer test-access-token');
    expect(forecast.url).toContain('/kbyg/spots/forecasts/surf');
    expect(forecast.url).toContain('spotId=test-spot');
  });

  it('refuses forecast calls before login', async () => {
    stubFetch();
    const client = new SurflineHttpClient();
    await expect(client.getSurf('test-spot', 1, 1)).rejects.toThrow(
      'You must be logged in to get surf data.',
    );
  });

  it('surfaces a failed login rather than reporting success', async () => {
    jest
      .spyOn(Impit.prototype, 'fetch')
      .mockResolvedValue(
        asImpitResponse(new Response('denied', { status: 403 })),
      );
    const client = new SurflineHttpClient();
    await expect(client.login('a@b.c', 'pw')).rejects.toThrow(
      'Failed to login to Surfline.',
    );
  });
});

const cheerio = require('cheerio');
const axios = require('axios');
const cj = require('color-json');
const currency = require('currency.js');

const cities = [
  'sfbay',
  'boston',
  'richmond',
  'austin',
  'miami',
  'savannah',
  'montreal',
  'losangeles',
  'charleston',
  'denver',
  'baltimore',
  'raleigh',
  'chicago',
  'cleveland',
];
const searches = [
  /\b(inns?|hotels?|motels?)\b/gi,
  /((\d+|four|five|six|seven|eight|nine|ten|eleven|twelve|multi)[-\t ]?(units?|family|((du|tri|quad)?plexe?s?)|families))/gi,
];
const properties = [
  /((\d+|four|five|six|seven|eight|nine|ten|eleven|twelve)[-\t ]((bed|bath)?rooms?))/gi,
  /\$[\d,.]+/gi,
];
const finances = [
  'cap rate',
  'actual annual gross income',
  'annual gross income',
  'gross income',
  'net operating income',
  'noi',
  'asking',
  'asking price',
  'roi',
  'return on investment',
  'cash flow',
  'cash on cash',
];
const neighborhood = ['university', 'college', 'campus', 'downtown'];

const hilites = [
  ...searches,
  ...properties,
  new RegExp(cities.join('|'), 'gi'),
  new RegExp(finances.join('|'), 'gi'),
  new RegExp(neighborhood.join('|'), 'gi'),
];

const fetchCraigslist = async city => {
  const path = `https://${city}.craigslist.org/jsonsearch/rea`;
  try {
    const { data } = await axios.get(path);
    const list = data[0]
      .filter(({ PostingURL = undefined }) => PostingURL !== undefined)
      .sort((a, b) => a.PostedDate < b.PostedDate);
    return list;
  } catch (e) {
    return null;
  }
};

const fetchCraigslistDetails = async listing => {
  const { PostingURL } = listing;
  try {
    const { data: html } = await axios.get(PostingURL);
    const $ = cheerio.load(html);
    const body = $('#postingbody')
      .text()
      .replace('QR Code Link to This Post', '');
    const title = $('.postingtitle').text();
    const address = $('div.mapaddress').text();
    const gmap = $('p.mapaddress small a').attr('href');
    const images = $('a.thumb')
      .map(function(i, e) {
        return $(this).attr('href');
      })
      .get();
    return { title, address, body, gmap, images, ...listing };
  } catch (e) {
    return null;
  }
};

const multifamilyFilter = details => {
  const { title, body } = details;

  for (search of searches) {
    const matched = title.match(search) || body.match(search);
    if (matched) {
      return true;
    }
  }
  return false;
};

const findRentals = async city => {
  console.log({ city });
  const list = await fetchCraigslist(city);
  const details = await Promise.all(
    list.filter(obj => !!obj).map(fetchCraigslistDetails),
  );
  const rentals = details.filter(obj => !!obj).filter(multifamilyFilter);
  console.log({ city, found: rentals.length });
  return rentals;
};

const findAllRentals = async cities => {
  const rentals = await Promise.all(cities.map(findRentals));
  console.log({
    allFound: rentals.reduce((sum, rental) => sum + rental.length, 0),
  });
  const answer = rentals.reduce((accum, rental) => {
    accum.push(...rental);
    return accum;
  }, []);
  console.log({ allFound: answer.length });
  return answer;
};

findAllRentals(cities).then(data => {
  const trim = text =>
    text
      .split(/\s+\n+|\n+/gi)
      .filter(s => s.length)
      .map(s => s.trim());
  const results = data.map(({ PostingURL, address, title, body }, index) => ({
    index,
    address,
    url: PostingURL,
    body: trim(body),
    title: trim(title)[1],
  }));

  const options = {
    separator: 'white',
    string: 'white',
    number: 'blue',
    boolean: 'magenta',
    null: 'red',
    key: 'green',
  };

  const text = cj(results, options);
  const text2 = hilites.reduce((accum_text, pattern) => {
    return accum_text.replace(pattern, match => {
      return `\x1b[31m${match}\x1b[0m`;
    });
  }, text);
  const text3 = text2.replace(
    /\$([\d,.]+)/gi,
    match => `\x1b[35m\$${currency(match, { precision: 0 }).format()}\x1b[0m`,
  );
  console.log(text3);
});

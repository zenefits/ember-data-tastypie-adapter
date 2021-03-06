var get = Ember.get, set = Ember.set;
var forEach = Ember.ArrayPolyfills.forEach;

function rejectionHandler(reason) {
  Ember.Logger.error(reason, reason.message);
  throw reason;
}

var DjangoTastypieAdapter = DS.RESTAdapter.extend({
  /**
    Set this parameter if you are planning to do cross-site
    requests to the destination domain. Remember trailing slash
  */
  serverDomain: null,

  /**
    This is the default Tastypie namespace found in the documentation.
    You may change it if necessary when creating the adapter
  */
  namespace: "api/v1",

  /**
    Bulk commits are not supported at this time by the adapter.
    Changing this setting will not work
  */
  bulkCommit: false,

  /**
    Tastypie returns the next URL when all the elements of a type
    cannot be fetched inside a single request. Unless you override this
    feature in Tastypie, you don't need to change this value. Pagination
    will work out of the box for findAll requests
  */
  since: 'next',

  /**
    Serializer object to manage JSON transformations
  */
  defaultSerializer: '-django-tastypie',

  buildURL: function(type, id, record) {
    var url = this._super(type, id, record);
    var serverDomain = this.get('serverDomain');

    // Add the trailing slash to avoid setting requirement in Django.settings
    if (url.charAt(url.length -1) !== '/') {
      url += '/';
    }

    // Add the server domain if any
    if (!!serverDomain) {
      url = this.removeTrailingSlash(serverDomain) + url;
    }

    return url;
  },

  findMany: function(store, type, ids, records) {
    return this.ajax(Ember.String.fmt('%@set/%@/', this.buildURL(type.typeKey), ids.join(';')),
                     'GET');
  },

  _stripIDFromURL: function(store, record) {
      var type = store.modelFor(record);
      var url = this.buildURL(type.typeKey, record.get('id'), record);

      var expandedURL = url.split('/');
      //Case when the url is of the format ...something/:id
      var lastSegment = expandedURL[ expandedURL.length - 2 ];
      var id = record.get('id');
      if (lastSegment === id) {
        expandedURL[expandedURL.length - 2] = "";
      } else if(endsWith(lastSegment, '?id=' + id)) {
        //Case when the url is of the format ...something?id=:id
        expandedURL[expandedURL.length - 1] = lastSegment.substring(0, lastSegment.length - id.length - 1);
      }

      return expandedURL.join('/');
    },

    /**
      http://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers
    */
    maxUrlLength: 2048,

    /**
      Organize records into groups, each of which is to be passed to separate
      calls to `findMany`.
      This implementation groups together records that have the same base URL but
      differing ids. For example `/comments/1` and `/comments/2` will be grouped together
      because we know findMany can coalesce them together as `/comments?ids[]=1&ids[]=2`
      It also supports urls where ids are passed as a query param, such as `/comments?id=1`
      but not those where there is more than 1 query param such as `/comments?id=2&name=David`
      Currently only the query param of `id` is supported. If you need to support others, please
      override this or the `_stripIDFromURL` method.
      It does not group records that have differing base urls, such as for example: `/posts/1/comments/2`
      and `/posts/2/comments/3`
      @method groupRecordsForFindMany
      @param {DS.Store} store
      @param {Array} records
      @return {Array}  an array of arrays of records, each of which is to be
                        loaded separately by `findMany`.
    */
    groupRecordsForFindMany: function (store, records) {
      var groups = Ember.MapWithDefault.create({defaultValue: function(){return [];}});
      var adapter = this;
      var maxUrlLength = this.maxUrlLength;

      forEach.call(records, function(record){
        var baseUrl = adapter._stripIDFromURL(store, record);
        groups.get(baseUrl).push(record);
      });

      function splitGroupToFitInUrl(group, maxUrlLength, paramNameLength) {
        var baseUrl = adapter._stripIDFromURL(store, group[0]);
        var idsSize = 0;
        var splitGroups = [[]];

        forEach.call(group, function(record) {
          var additionalLength = encodeURIComponent(record.get('id')).length + paramNameLength;
          if (baseUrl.length + idsSize + additionalLength >= maxUrlLength) {
            idsSize = 0;
            splitGroups.push([]);
          }

          idsSize += additionalLength;

          var lastGroupIndex = splitGroups.length - 1;
          splitGroups[lastGroupIndex].push(record);
        });

        return splitGroups;
      }

      var groupsArray = [];
      groups.forEach(function(group, key){
        var paramNameLength = '&ids%5B%5D='.length;
        var splitGroups = splitGroupToFitInUrl(group, maxUrlLength, paramNameLength);

        forEach.call(splitGroups, function(splitGroup) {
          groupsArray.push(splitGroup);
        });
      });

      return groupsArray;
    },

  /**
    sinceToken is defined by since property, which by default points to 'next' field in meta.
    We process this token to get the correct offset for loading more data.
    
  */
  findAll: function(store, type, sinceToken) {
    var query;

    if (sinceToken) {
      var offsetParam = sinceToken.match(/offset=(\d+)/);
      offsetParam = (!!offsetParam && !!offsetParam[1]) ? offsetParam[1] : null;
      query = { offset: offsetParam };
    }

    return this.ajax(this.buildURL(type.typeKey), 'GET', { data: query });
  },

  removeTrailingSlash: function(url) {
    if (url.charAt(url.length -1) === '/') {
      return url.slice(0, -1);
    }
    return url;
  },

  /**
    django-tastypie does not pluralize names for lists
  */
  pathForType: function(type) {
    return type;
  }
});

export default DjangoTastypieAdapter;

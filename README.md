## &lt;buttress-db&gt;

### Version: 3.1.0-alpha.1

A set of elements enabling realtime data handling from ButtressJS

Sample use:

```html
<buttress-db
  endpoint="endpoint.example.com",
  app-id="[[publicAppId]]",
  api-path="[[ApiPath]]",
  user-id="[[AuthedUserId]]",
  token="[[AuthedUserToken]]",
  loaded="{{dbLoaded}}",
  error="{{dbError}}",
  settings="{{dbSettings}}",
  db="{{db}}",
  io="{{io}}",
  core-collections="[[dbCoreCollections]]">
</buttress-db>
```

## TODO
* ~~Publish to npm~~
* ~~Move away from bower~~
* ~~Check compatibility with Polymer 3~~
* Update to use lit-element
* Write TESTS!1!!!
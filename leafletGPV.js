function creatGPV(GPVbuffer) {
    //netcdfを読み込み
    var reader = new netcdfjs(GPVbuffer);
    var mincoord = [137.2054449000489740,34.3841637569933951];
    var maxcoord = [141.6250878726040412,37.3237017864477068];
    weatherGPV = new GPVdata(reader,mymap,mincoord,maxcoord);
}

function setScaleLegendByID(scale,tgtid) {
    const $wrap = document.createElement('span');
    var maxsplit = 20;
    var domain = scale.domain();
    
    var split = (domain[0] - domain[1])/maxsplit;
    var labels = (new Array(maxsplit)).fill('').map((d,i) => (i*split)+domain[1]);
    var tgtdom = document.getElementById(tgtid);
    tgtdom.innerHTML='';
    $wrap.innerHTML = labels.reduce(
        (save, label, i) => `${save}<span style="color: ${scale(label).get('lab.l') < 70 ? '#fff' : '#000'}; background-color: ${scale(label)}; border: 1px solid #000000;">${label.toFixed(1)}</span>`, '');
    tgtdom.append($wrap);
    
}


function latlontoXY(point) {
    var grid = turf.point(point);
    var gridXY = turf.toMercator(grid);
    var gridXYcoord = turf.getCoord(gridXY);
    return gridXYcoord;
}

function XYtoLatlon(point){
    var grid = turf.point(point);
    var gridLatLon = turf.toWgs84(grid);
    var gridLatLoncoord = turf.getCoord(gridLatLon);
    return gridLatLoncoord;
}

class lyrObj {
    constructor(leafletMap){
        this.L = [];
        this.leafletMap = leafletMap
    }
    removeLyr(){
        if (this.L.length==0) {
            return;
        }
        for (let index = 0; index < this.L.length; index++) {
            this.leafletMap.removeLayer(this.L[index]);
            
        }
        this.L = [];
    }
    setlyr(lyr){
        this.L.push(lyr)
    }
}

class GPVdata {
    constructor(GPVreader,leafletMap,rasterMincoord,rasterMaxcoord) {
        this.reader = GPVreader;
        this.map = leafletMap;
        //緯度経度の配列を取得
        this.lon_array = this.reader.getDataVariable("lon");
        this.lat_array = this.reader.getDataVariable("lat");
        this.rasterMincoord = rasterMincoord;
        this.rasterMaxcoord = rasterMaxcoord;
        //2次元の画像のピクセルの中心点群の作成
        var cells = [];
        for (let index = 0; index < this.lat_array.length; index++) {
            var lat = this.lat_array[index];
            for (let lonindex = 0; lonindex < this.lon_array.length; lonindex++) {
                var lon = this.lon_array[lonindex];
                var polygon = turf.point([lon,lat]);
                //1次元として中心点群を作成
                cells.push(polygon);
            }
        }

        // this.makeWeatherLayer();
        this.rasterpol = cells;
        //地図の中心から最も近いピクセルの添え字(1次元)
        this.nearlestGrid = -1;
        //XYと時間
        this.X = 0;
        this.Y = 0;
        this.time = 0;

        for (let index = 0; index < this.reader.dimensions.length; index++) {
            var element = this.reader.dimensions[index];
            if (element.name == "lon") {
                this.X = element.size;
            }
            if (element.name == "lat") {
                this.Y = element.size;
            }
        }
        //1次元の最大ラスターサイズ
        this.rastersize = this.X * this.Y;
        //開始時刻から時間の配列を作成
        this.starttime = this.getmeta("time","units");
        this.formtstrttime = this.starttime.replace("hours since ","");
        this.timearray = this.reader.getDataVariable("time");
        this.dates = [];
        for (let index = 0; index < this.timearray.length; index++) {
            var time = this.timearray[index];
            var resdate = new Date(this.formtstrttime);
            resdate.setHours(resdate.getHours()+(time));
            this.dates.push(resdate);
        }

    }

    //予報値をRasterレイヤーに格納
    makeWeatherLayer(){
        //予報値のラスターレイヤー名
        this.rasterLyrname = ["temp",
                                "v",
                                "u",
                                "clda",
                                "rh",
                                "r1h",
                                "sp"];
        //レイヤー管理オブジェクトをラスターレイヤー名ごとに定義
        this.GPVlayerID = {};
        for (let index = 0; index < this.rasterLyrname.length; index++) {
            const element = this.rasterLyrname[index];
            this.GPVlayerID[element] = new lyrObj(this.map);
        }
        this.rasterAttr = {};
        //予報値を補正
        for (let index = 0; index < this.rasterLyrname.length; index++) {
            const element = this.rasterLyrname[index];
            this.rasterAttr[element] = [];
            var scale_factor = this.getmeta(element,"scale_factor");
            var add_offset = this.getmeta(element,"add_offset");
            var rasterRaw = this.reader.getDataVariable(element);
            for (let rasteridx = 0; rasteridx < rasterRaw.length; rasteridx++) {
                var rawVal = rasterRaw[rasteridx];
                var fixval = (rawVal*scale_factor)+add_offset;
                this.rasterAttr[element].push(fixval);
            }
        }
        //時間ごとのラスターレイヤーを作成
        this.rasterLyrs = [];
        for (let timeindex = 0; timeindex < this.timearray.length; timeindex++) {
            var layers = {};
            var time = this.timearray[timeindex];
            //予報値のレイヤーを作成
            for (let nameindex = 0; nameindex < this.rasterLyrname.length; nameindex++) {
                const lyrname = this.rasterLyrname[nameindex];
                layers[lyrname] = null
                var emptyGrid = [];
                //ラスターレイヤーの作成
                for (let index = 0; index < this.lat_array.length - 1 ; index++) {
                    var lat = this.lat_array[index];
                    if ( lat < this.rasterMincoord[1] || this.rasterMaxcoord[1] < lat) {
                        continue;
                    }
                    var latn = this.lat_array[index + 1];
                    for (let lonindex = 0; lonindex < this.lon_array.length - 1 ; lonindex++) {
                        var lon = this.lon_array[lonindex];
                        if ( lon < this.rasterMincoord[0] || this.rasterMaxcoord[0] < lon ) {
                            continue;
                        }
                        var lonn = this.lon_array[lonindex + 1];
                        
                        var XY = latlontoXY([lon,lat]);
                        var XYn = latlontoXY([lonn,latn]);
                        var Xdiff  = (Math.abs(XY[0]-XYn[0]))/2;
                        var Ydiff  = (Math.abs(XY[1]-XYn[1]))/2;
        
                        var p1 = [XY[0]-Xdiff,
                                    XY[1]-Ydiff];
        
                        var p2 = [p1[0],
                                    p1[1]+(Ydiff*2)];
        
                        var p3 = [p2[0]+(Xdiff*2),
                                    p2[1]];
        
                        var p4 = [p3[0],
                                    p3[1]-(Ydiff*2)];
        
                        var cellcoord = [[p1,p2,p3,p4,p1].map(function (coord) {
                           return XYtoLatlon(coord)
                        })];
                        //属性値の取得
                        var Grididx = (index*this.X) + lonindex;
                        var timeidx = (this.rastersize*time);
                        // timeidx = 0;
                        var valindex = (timeidx+Grididx);
                        var rasterVal = this.rasterAttr[lyrname][valindex];
                        var fixval = rasterVal;                    
                        if (lyrname=="temp") {
                            var fixval = this.getDegree(rasterVal);

                        };
                        var polygon = turf.polygon(cellcoord,
                                                   {"val":fixval,
                                                    "X":XY[0],
                                                    "Y":XY[1],
                                                    "lon":lon,
                                                    "lat":lat});
                        emptyGrid.push(polygon);
                        
                    
                    }
                }
                console.log(lyrname);
                console.log(time);
                layers[lyrname] = turf.featureCollection(emptyGrid);
                
            }
            this.rasterLyrs.push(layers);
        }
    }
    deleteTempLayer(){
        this.GPVlayerID["temp"].removeLyr();
    }

    makeTempLayer(){
        var lyrname = "temp";
        var grid = this.rasterLyrs[this.time][lyrname];
        var temps = [];
        for (let index = 0; index < grid.features.length; index++) {
          var degree = grid.features[index].properties["val"];
          grid.features[index].properties["val"] = degree;
          temps.push(degree);
        }
        
        var color_scale = chroma.scale('Spectral').domain([Math.max.apply(null,temps),
                                                           Math.min.apply(null,temps)]);
        this.tempcolor = color_scale
        function style(feature) {
            return {
                fillColor:color_scale(feature.properties["val"]).hex(),
                weight: 2,
                opacity: 0,
                fillOpacity: 0.7
            };
        }
        this.deleteTempLayer();
        var gridLayer = L.geoJson(grid,{style: style});
        gridLayer.addTo(this.map);
        this.GPVlayerID[lyrname].setlyr(gridLayer);
        
    }

    deleteWindLayer(){
        this.GPVlayerID["u"].removeLyr();
        this.GPVlayerID["v"].removeLyr();
    }

    // makeWindLayer(){
    //     var gridU = this.rasterLyrs[this.time]["u"];
    //     var gridV = this.rasterLyrs[this.time]["v"];
    //     var speeds = []
    //     var windangles = []

    //     for (let index = 0; index < gridU.features.length; index++) {
    //         const U = gridU.features[index].properties["val"];
    //         const V = gridV.features[index].properties["val"];
    //         var speed = this.getWindSpeed(U,V);
    //         var angle = this.getWindAngle(U,V);
    //         gridU.features[index].properties["speed"] = speed;
            
    //         var anglepoint =new L.Marker([gridV.features[index].properties["lat"], 
    //                                       gridV.features[index].properties["lon"]], {
    //             icon: new L.DivIcon({
    //                 className: 'my-div-icon',
    //                 html: '<img class=\"my-div-image\"'+
    //                        "style=\"transform: rotate("+String(angle-180)+"deg)\""+ 'src=\"./etc/wind.png\"/>'
    //             })
    //         });
    //         anglepoint.addTo(this.map);
    //         windangles.push(anglepoint);
    //         speeds.push(speed)
    //     }

    //     var color_scale = chroma.scale('Spectral').domain([Math.max.apply(null,speeds),
    //                                                        Math.min.apply(null,speeds)]);
    //     this.windcolor = color_scale;


    //     function style(feature) {
    //         return {
    //             fillColor:color_scale(feature.properties["speed"]).hex(),
    //             weight: 2,
    //             opacity: 0,
    //             fillOpacity: 0.5
    //         };
    //     }
    //     this.deleteWindLayer();
    //     var gridLayer = L.geoJson(gridU,{style: style});
    //     gridLayer.addTo(this.map);
    //     for (let index = 0; index < windangles.length; index++) {
    //         const element = windangles[index];
    //         this.GPVlayerID["v"].setlyr(element);
    //     }
    //     this.GPVlayerID["u"].setlyr(gridLayer)

    // }
    
    //レイヤーをすべて削除
    deleteLayer(){
        this.deleteTempLayer();
        this.deleteWindLayer();
    }
    //座標にもっと近いピクセルを取得
    getGrid(coord){
        var dists = this.rasterpol.map(function (point) {
            return turf.distance(coord,point);
        })

        var mindist = dists.reduce(function(a, b) {
            return Math.min(a, b);
        });

        this.nearlestGrid = dists.indexOf(mindist) + 1;

        if (this.nearlestGrid == -1) {
            throw "Not found nearlest pixel";
        }
    }

    //マップ中心座標から最も近いピクセルを取得
    getCenterGrid(){
        var latlon = this.map.getCenter();
        var point = turf.point([latlon.lng,latlon.lat]);
        this.getGrid(point);
    }

    //windyライクなレイヤの作成途中
    createLikeWindyWindRaster(){
        return
    }
    //メタデータの取得
    getmeta(attrname,name){
        for (let index = 0; index < this.reader.variables.length; index++) {
            var element = this.reader.variables[index];
            if (element.name == attrname) {
                for (let attrindex = 0; attrindex < element.attributes.length; attrindex++) {
                    var property = element.attributes[attrindex];
                    if (property.name==name) {
                        return property.value;
                    }
                }
            }
        }
    }
    //予報値名を指定してもっとも予報地点の予報地取得
    getAttrs(attrname){
        if (this.nearlestGrid == -1) {
            throw "Nearest pixel is not set";
        }
        
        var scale_factor = -1;
        var add_offset = -1;
        var unit = ""
        scale_factor = this.getmeta(attrname,"scale_factor");
        add_offset =  this.getmeta(attrname,"add_offset");
        unit = this.getmeta(attrname,"units");
        if (scale_factor == -1) {
            throw attrname + ":not found scale factor";
        }
        if (add_offset == -1) {
            throw attrname + ":not found add offset";
        }

        var attrarray = this.reader.getDataVariable(attrname);  
        var attrs = {unit:unit,val:[]};

        for (let index = 0; index < this.timearray.length; index++) {
            var time = this.timearray[index];
            // console.log("time:"+time);
            var valindex = ((this.rastersize*(time))+this.nearlestGrid)-1;
            // console.log("validx:"+valindex);
            var attr = (attrarray[valindex]*scale_factor)+add_offset;
            attrs.val.push(attr);
        }
        return attrs;
    }
    //もっとも中心点に近い気温（摂氏）
    getDegree(temp){
        return temp - 273.15;
    }
    //摂氏温度の算出
    getTemp(){
        this.kelvinTemps = this.getAttrs("temp");
        this.temps = {
            unit: "℃",
            val:[]
        }
        this.temps.val = this.kelvinTemps.val.map(function (temp) {
            return temp  - 273.15;
        }
            
        );
    }
    //風のベクトルの南北東西成分から風向を算出
    getWindAngle(U,V){
        return (Math.atan2(U,V)+ Math.PI)*(180/Math.PI);
    }
    //風のベクトルの南北東西成分から風速を算出
    getWindSpeed(U,V){
        return Math.sqrt((V**2+U**2));
    }
    //もっとも近い予測点の風向と風速
    getWind(){
        this.windsN = this.getAttrs("v");
        this.windsW = this.getAttrs("u");
        this.windVs = {unit:"deg",val:[]};
        this.windSs = {unit:"m/s",val:[]}
        for (let index = 0; index < this.windsN.val.length; index++) {
            var V = this.windsN.val[index];
            var U = this.windsW.val[index];
            this.windVs.val.push(this.getWindAngle(U,V));
            this.windSs.val.push(this.getWindSpeed(U,V));
        }
    }
    //もっとも近い予測点の予測値
    _getweather(){
        this.getTemp();
        this.getWind();
        this.clouds = this.getAttrs("clda");
        this.humms = this.getAttrs("rh");
        this.rainphs = this.getAttrs("r1h");
        this.airprs = this.getAttrs("sp"); 
        this.wheathers = []
        for (let index = 0; index < this.timearray.length; index++) {
            var idx = this.timearray[index];
            var attr = {
                temp:this.temps.val[idx],
                cloud:this.clouds.val[idx],
                rain:this.rainphs.val[idx],
                humm:this.humms.val[idx],
                airps:this.airprs.val[idx],
                windv:this.windVs.val[idx],
                winds:this.windSs.val[idx]
            }
            this.wheathers.push(attr)   
        }
    }

    //もっとも中心点に一般的な天気予報の取得
    getweather(){
        this.getCenterGrid();
        this._getweather();
    }
}
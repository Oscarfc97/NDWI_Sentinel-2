# NDWI_Sentinel-2
Este codigo de Google Earth Engine permite calcular el NDVI y la cobertura vegetal de varías imágenes Sentinel 2

Link Directo a GEE
https://code.earthengine.google.com/81ef00d157e0abf47faf3cb0385d725d

// Definir el polígono de la región de interés (ROI)
var roi= ee.Geometry.Polygon(
        [[[-91.84433469086221, 17.92798219201935], 
        [-91.84433469086221, 17.699832557873403], 
        [-91.60400876312784, 17.699832557873403], 
        [-91.60400876312784, 17.92798219201935]]], null, false);

// Filtrar imágenes Sentinel-2 por fecha, ubicación y porcentaje de píxeles nubosos
var collection = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(roi)
 .filterDate('2024-01-01', '2024-05-16')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 2));

// Función para calcular el índice NDVI
function calcularNDVI(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
}

// Aplicar la funcion del calculo de NDVI para cada imagen
var collectionConNDVI = collection.map(calcularNDVI);

// Imprimir información sobre la colección
print('Colección con RGB', collection);
print('Colección con NDVI:', collectionConNDVI);

// Obtener la lista de imágenes de la colección
var listaImagenes = collectionConNDVI.toList(collectionConNDVI.size());

// Crear una lista para almacenar las áreas de cada imagen
var areasList = [];

// Iterar sobre cada imagen y visualizarla
for (var i = 0; i < listaImagenes.length().getInfo(); i++) {
  var image = ee.Image(listaImagenes.get(i));
  visualizarImagenes(image);
}

// Exportar las áreas como un archivo CSV
Export.table.toDrive({
  collection: ee.FeatureCollection(areasList),
  description: 'Areas_Cobertura',
  folder: 'GEE_Resultados', // Ajusta la carpeta de destino
  fileFormat: 'CSV'
});

// Función para visualizar las imágenes RGB y NDVI
function visualizarImagenes(image) {
  // Seleccionar la región de interés
  var imagenROI = image.clip(roi);

  // Obtener la fecha de la imagen
  var fecha = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd');

  // Seleccionar bandas RGB
  var rgb = imagenROI.select(['B4', 'B3', 'B2']);

  // Obtener la imagen NDVI
  var ndvi = imagenROI.select('NDVI');
  
  // Implementar Filtro Cobertura vegetal (.where). 
  var seaWhere = ee.Image(1).clip(roi);
  seaWhere = seaWhere.where(ndvi.lt(0.1), 1); // Agua
  seaWhere = seaWhere.where(ndvi.gte(0.1).and(ndvi.lte(0.40)), 2); // Sin vegetación
  seaWhere = seaWhere.where(ndvi.gt(0.40).and(ndvi.lte(0.52)), 3); // Vegetación baja
  seaWhere = seaWhere.where(ndvi.gt(0.52).and(ndvi.lte(0.58)), 4); // Vegetación Densa
  seaWhere = seaWhere.where(ndvi.gt(0.58), 5); // Cultivos


// Convertir la cobertura vegetal a polígonos
  var coberturaPoligonos = seaWhere.reduceToVectors({
    geometry: roi,
    scale: 10,
    geometryType: 'polygon',
    eightConnected: false,
    labelProperty: 'cobertura',
    reducer: ee.Reducer.countEvery() // Reducer para etiquetar los polígonos
  });
  
  // Crear un diccionario para almacenar las áreas con nombres de cobertura
  var areasDict = {};

  for (var a = 1; a < 6; a++) {
    var tipoCobertura;
  
    // Asignar el nombre del tipo de cobertura según el valor de a
    if (a === 1) tipoCobertura = 'Agua';
    else if (a === 2) tipoCobertura = 'Sin Vegetación';
    else if (a === 3) tipoCobertura = 'Vegetación Media';
    else if (a === 4) tipoCobertura = 'Vegetación Densa';
    else if (a === 5) tipoCobertura = 'Cultivos';

    var x = seaWhere.eq(a).multiply(ee.Image.pixelArea());
    var calculation = x.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: roi,
      scale: 10,
      maxPixels: 1e13
    });

    // Almacenar el área en el diccionario con el nombre del tipo de cobertura
    areasDict[tipoCobertura + ' Km2'] = ee.Number(calculation.values().get(0)).divide(1e6);
  }

  // Agregar el diccionario a la lista de áreas
  areasList.push(ee.Feature(null, areasDict).set({
    'Fecha': fecha,
    'Nombre_Imagen': image.id()
  }));


  // Convertir el diccionario en una lista de características
  var features = ee.List([]);
  for (var key in areasDict) {
    features = features.add(ee.Feature(null, {
      'Tipo_Cobertura': key,
      'Area_Km2': areasDict[key]
    }));
  }

  // Convertir la fecha a una cadena
  var fechaStr = fecha.getInfo();

 // Visualizar Resultados finales
  Map.centerObject(roi, 10);
// Mapa de RGB
  Map.addLayer(rgb, {min: 1000, max: 5000, gamma: 2.1}, 'RGB ' + fechaStr);
// Mapa de Ndvi
  Map.addLayer(ndvi, {min: -1, max: 1, palette: ['red', 'yellow', 'green']}, 'NDVI ' + fechaStr);
// Mapa de cobertura Vegetal 
  var Cobpalette = ['#363C3A', '#796C64', '#507251', '#39503E', '#384A3C'];
  Map.addLayer(seaWhere, {min: 1, max: 5, palette: Cobpalette}, 'Cobertura' + fechaStr);
// MApear poligonos de cobertura
// Map.addLayer(coberturaPoligonos, 
// {color: 'black', width: 1},   'Cobertura Agua Polígonos ' + fechaStr);

  // Imprimir información sobre la imagen
  print('Información de la imagen - Fecha:', fechaStr, 'ID:', image.id());

 // EXPORTAR RESULTADOS 
  
  // Exportar los polígonos de cobertura de agua como un archivo Shapefile
   var PoligonoCobertura = 'Poligono Cobertura_' + fechaStr;
  Export.table.toDrive({
    collection: coberturaPoligonos,
    description: PoligonoCobertura,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    fileFormat: 'SHP'
  });
  
   // Exportar la Cobertura a Google Drive
  var nombreCobertura = 'Cobertura_' + fechaStr;
  Export.image.toDrive({
    image: seaWhere,
    description: nombreCobertura,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    scale: 10, // Ajusta la escala según tus necesidades
    region: roi,
    maxPixels: 1e13
  });
  
  // Exportar la imagen RGB a Google Drive
  var nombreRGB = 'RGB_' + fechaStr;
  Export.image.toDrive({
    image: imagenROI.select(['B4', 'B3', 'B2']),
    description: nombreRGB,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    scale: 10, // Ajusta la escala según tus necesidades
    region: roi,
    maxPixels: 1e13
  });
  
    // Exportar la imagen NDWI a Google Drive
  var nombreNDVI = 'NDVI_' + fechaStr;
  Export.image.toDrive({
    image: imagenROI.select('NDVI'),
    description: nombreNDVI,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    scale: 10, // Ajusta la escala según tus necesidades
    region: roi,
    maxPixels: 1e13
  });
}

// AGREGAR LEYENDA
var panel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '5px;'
  }
})

var title = ui.Label({
  value: 'Clasificación',
  style: {
    fontSize: '12px',
    fontWeight: 'bold',
    margin: '0px;'
  }
})

panel.add(title)

var Cobpalette = ['#363C3A', '#796C64', '#507251', '#39503E', '#384A3C'];
var lc_class = ['Agua', 'Sin vegetación', 'Vegetación Media', 'Vegetación Densa', 'Cultivos']

var list_legend = function(Cobpalette, description) {
  
  var c = ui.Label({
    style: {
      backgroundColor: Cobpalette,
      padding: '10px',
      margin: '4px'
    }
  })
  
  var ds = ui.Label({
    value: description,
    style: {
      margin: '5px'
    }
  })
  
  return ui.Panel({
    widgets: [c, ds],
    layout: ui.Panel.Layout.Flow('horizontal')
  })
}

for(var a = 0; a < 5; a++){
  panel.add(list_legend(Cobpalette[a], lc_class[a]))
}

Map.add(panel)

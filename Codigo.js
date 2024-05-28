# NDWI_Sentinel-2
Este codigo de Google Earth Engine permite calcular el NDWI para varías imágenes Sentinel 2

// Definir el polígono de la región de interés (ROI)
var roi= ee.Geometry.Polygon(
        [[[-91.80096677197756,17.702695931702213],
        [-91.6059594477588,17.702695931702213],
        [-91.6059594477588,17.965463116030733], 
        [-91.80096677197756,17.965463116030733], 
        [-91.80096677197756,17.702695931702213]]], null, false);

// Filtrar imágenes Sentinel-2 por fecha, ubicación y porcentaje nubosidad
var collection = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(roi)
  .filterDate('2023-01-01', '2024-05-28')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 4));

// Función para calcular el índice NDWI de cada imagen de la coleccion
function calcularNDWI(image) {

// Calculo de NDWI para cada imagen
var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
 return image.addBands(ndwi);
}

// Ejecutar el calculo de NDWI para cada imagen
var collectionConNDWI = collection.map(calcularNDWI);

// Imprimir información sobre la colección
print('Colección con RGB', collection);
print('Colección con NDWI:', collectionConNDWI);

// Obtener la lista de imágenes que componen a la colección
var listaImagenes = collectionConNDWI.toList(collectionConNDWI.size());

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
  description: 'Areas_Cobertura_Agua',
  folder: 'GEE_Resultados', // Ajusta la carpeta de destino
  fileFormat: 'CSV'
});

// Función para visualizar las imágenes RGB y NDWI
function visualizarImagenes(image) {
  // Seleccionar la región de interés
  var imagenROI = image.clip(roi);

  // Obtener la fecha de la imagen
  var fecha = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd');

  // Seleccionar bandas RGB
  var rgb = imagenROI.select(['B4', 'B3', 'B2']);

  // Obtener la imagen NDwI
  var ndwi = imagenROI.select('NDWI');
  
  // Implementar Filtro Cobertura de agua (.where), los umbrales 
  //de cobertura deben ajustarse segun el area a trabajar.
  var seaWhere = ee.Image(1).clip(roi);
  seaWhere = seaWhere.where(ndwi.gte(-0.05), 1); // Agua
  seaWhere = seaWhere.where(ndwi.lt(-0.05), 2); // Vegetación


// Convertir la cobertura de agua a polígonos
  var coberturaAguaPoligonos = seaWhere.reduceToVectors({
    geometry: roi,
    scale: 10,
    geometryType: 'polygon',
    eightConnected: false,
    labelProperty: 'cobertura',
    reducer: ee.Reducer.countEvery() // Reducer para etiquetar los polígonos
  });
  
  // Crear un diccionario para almacenar las áreas con nombres de cobertura
  var areasDict = {};

  for (var a = 1; a < 3; a++) {
    var tipoCobertura;
  
    // Asignar el nombre del tipo de cobertura según el valor de a
    if (a === 1) tipoCobertura = 'Agua';
    else if (a === 2) tipoCobertura = 'Vegetación';
  
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

  // Imprimir el diccionario con todas las áreas agrupadas
  //print('Áreas totales:', areasDict);

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

  // Visualizar resultados finales
  Map.centerObject(roi, 12);
  // Mapa RGB
  Map.addLayer(rgb, {min: 1000, max: 5000, gamma: 2.1}, 'RGB ' + fechaStr);
  // Mapa NDWI
  Map.addLayer(ndwi, {min: -0.6, max: 0.2,
  palette: ['000000','ffffff','bddaff','4887e6']}, 'NDWI ' + fechaStr);
  // Mapa Cobertura de Agua
  var Cobpalette = ['blue', 'white'];
  Map.addLayer(seaWhere, {min: 1, max: 2,   palette: Cobpalette}, 'Cobertura Agua ' + fechaStr);
  // MApear poligonos de cobertura
  Map.addLayer(coberturaAguaPoligonos, 
  {color: 'black', width: 1},   'Cobertura Agua Polígonos ' + fechaStr);
  // Imprimir información sobre la imagen
  //print('Información de la imagen - Fecha:', fechaStr, 'ID:', image.id());
  
  // EXPORTAR RESULTADOS 
  
  // Exportar los polígonos de cobertura de agua como un archivo Shapefile
   var PoligonoCobertura = 'Poligono-Agua_' + fechaStr;
  Export.table.toDrive({
    collection: coberturaAguaPoligonos,
    description: PoligonoCobertura,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    fileFormat: 'SHP'
  });
  
   // Exportar la Cobertura a Google Drive
  var nombreCobertura = 'Cobertura-Agua_' + fechaStr;
  Export.image.toDrive({
    image: seaWhere,
    description: nombreCobertura,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    scale: 10, // Ajusta la escala según tus necesidades
    region: geometry,
    maxPixels: 1e13
  });
  
  // Exportar la imagen RGB a Google Drive
  var nombreRGB = 'RGB_' + fechaStr;
  Export.image.toDrive({
    image: imagenROI.select(['B4', 'B3', 'B2']),
    description: nombreRGB,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    scale: 10, // Ajusta la escala según tus necesidades
    region: geometry,
    maxPixels: 1e13
  });
  
    // Exportar la imagen NDWI a Google Drive
  var nombreNDWI = 'NDWI_' + fechaStr;
  Export.image.toDrive({
    image: imagenROI.select('NDWI'),
    description: nombreNDWI,
    folder: 'GEE_Resultados', // Ajusta la carpeta de destino
    scale: 10, // Ajusta la escala según tus necesidades
    region: geometry,
    maxPixels: 1e13
  });
}

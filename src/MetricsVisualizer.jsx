import React, { useState } from 'react';
import ColumnChart from './ColumnChart';

const MetricsVisualizer = (props) => {

    const { lastQuerySpeed } = props;
    const {dataSet, setDataSet } = props;
    const { handleSaveClick } = props;

  //within state, ignore the first element within TimeData (although this will have to live up a level if it's being set by the graphiQL play button)
    return (
      <div>
        <div className='query-speed-box'>

            <h4>Query Response Time</h4>
            <p>{lastQuerySpeed}<span className='milliseconds-display'>ms</span></p>
            <button onClick={handleSaveClick}>Save As Comparison</button>
        </div>
        <ColumnChart dataSet={dataSet} />
      </div>
    )
}

export default MetricsVisualizer;
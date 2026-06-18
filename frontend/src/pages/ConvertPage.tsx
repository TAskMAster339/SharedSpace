import React from 'react';
import { useParams } from 'react-router-dom';

const ConvertPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <h1>Конвертация файла: {id}</h1>;
};

export default ConvertPage;
